require 'puma'
require 'faye/websocket'
require 'json'
require 'open-uri'
require 'rack'

# ポート設定
PORT = ENV['PORT'] || 8000

# フォルダ構造の自動判定
ROOT_DIR = Dir.exist?('./public') ? './public' : '.'
DATA_DIR = Dir.exist?('./data') ? './data' : '.'

class OthelloGame
  attr_reader :black_player, :white_player, :board, :turn

  def initialize
    @board = Array.new(8) { Array.new(8, nil) }
    @board[3][3] = 'white'
    @board[3][4] = 'black'
    @board[4][3] = 'black'
    @board[4][4] = 'white'
    @turn = 'black' # black starts
    @black_player = nil
    @white_player = nil
    @spectators = []
  end

  def add_player(ws, name)
    if @black_player.nil?
      @black_player = { ws: ws, name: name, color: 'black' }
      return 'black'
    elsif @white_player.nil?
      @white_player = { ws: ws, name: name, color: 'white' }
      return 'white'
    else
      @spectators << { ws: ws, name: name }
      return 'spectator'
    end
  end

  def remove_player(ws)
    if @black_player && @black_player[:ws] == ws
      @black_player = nil
    elsif @white_player && @white_player[:ws] == ws
      @white_player = nil
    else
      @spectators.reject! { |s| s[:ws] == ws }
    end
  end

  def handle_move(color, r, c)
    return false if color != @turn
    return false if @board[r][c] # Already occupied

    flipped = get_flipped_disks(r, c, color)
    return false if flipped.empty?

    # Apply move
    @board[r][c] = color
    flipped.each { |fr, fc| @board[fr][fc] = color }
    
    switch_turn
    true
  end

  def switch_turn
    @turn = (@turn == 'black' ? 'white' : 'black')
    # Use rudimentary check for pass (if no valid moves, switch back)
    # keeping it simple for now, can be improved
  end

  def get_flipped_disks(r, c, color)
    opponent = (color == 'black' ? 'white' : 'black')
    directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ]
    flipped = []

    directions.each do |dr, dc|
      temp_flipped = []
      cr, cc = r + dr, c + dc
      
      while cr.between?(0, 7) && cc.between?(0, 7) && @board[cr][cc] == opponent
        temp_flipped << [cr, cc]
        cr += dr
        cc += dc
      end

      if cr.between?(0, 7) && cc.between?(0, 7) && @board[cr][cc] == color && !temp_flipped.empty?
        flipped.concat(temp_flipped)
      end
    end
    flipped
  end

  def broadcast(msg)
    json = msg.to_json
    clients = []
    clients << @black_player[:ws] if @black_player
    clients << @white_player[:ws] if @white_player
    @spectators.each { |s| clients << s[:ws] }
    
    clients.each { |ws| ws.send(json) }
  end

  def game_state
    {
      type: 'state',
      board: @board,
      turn: @turn,
      black: @black_player ? @black_player[:name] : nil,
      white: @white_player ? @white_player[:name] : nil
    }
  end
end

# Global room manager
$rooms = {} # room_id => OthelloGame

class TrainApp
  def call(env)
    req = Rack::Request.new(env)

    if Faye::WebSocket.websocket?(env)
      ws = Faye::WebSocket.new(env)
      room_id = nil
      player_color = nil

      ws.on :message do |event|
        data = JSON.parse(event.data)
        
        case data['type']
        when 'join'
          room_id = data['roomId']
          name = data['name']
          
          game = $rooms[room_id] ||= OthelloGame.new
          player_color = game.add_player(ws, name)
          
          ws.send({ type: 'joined', color: player_color, roomId: room_id }.to_json)
          game.broadcast(game.game_state)
          
        when 'move'
          room_id = data['roomId']
          r = data['r']
          c = data['c']
          color = data['color']
          
          game = $rooms[room_id]
          if game && game.handle_move(color, r, c)
            game.broadcast(game.game_state)
          end
        end
      end

      ws.on :close do |event|
        if room_id && $rooms[room_id]
          game = $rooms[room_id]
          game.remove_player(ws)
          game.broadcast(game.game_state)
          # Cleanup empty rooms if needed, checking player count
          if game.black_player.nil? && game.white_player.nil?
             $rooms.delete(room_id)
          end
        end
        ws = nil
      end

      return ws.rack_response
    end

    # Legacy API handling
    if req.path == '/api/status'
      return handle_api_status
    end

    # Static file serving
    path = req.path
    path = '/index.html' if path == '/'
    
    # Try serving from public (ROOT_DIR)
    file_path = File.join(ROOT_DIR, path)
    if File.file?(file_path)
      return ServeFile(file_path)
    end
    
    # Try serving from data (DATA_DIR) for /data requests
    if path.start_with?('/data/')
      data_file = File.join(DATA_DIR, path.sub('/data/', ''))
      if File.file?(data_file)
        return ServeFile(data_file)
      end
    end

    [404, {'Content-Type' => 'text/plain'}, ['Not Found']]
  end

  def handle_api_status
    status_info = "平常運転"
    status_detail = ""
    is_delay = false

    begin
      url = 'https://transit.yahoo.co.jp/diainfo/386/386'
      html = URI.open(url, "User-Agent" => "Mozilla/5.0").read

      if html =~ /<(?:dd|div) class="trouble"(?:.*?)>(.*?)<\/(?:dd|div)>/m
        trouble_block = $1
        clean_detail = trouble_block.gsub(/<.*?>/, '').strip.gsub(/\s+/, ' ')
        
        status_info = "【遅延情報あり】"
        status_detail = clean_detail
        is_delay = true
      elsif html =~ /<div class="normal">/
        status_info = "平常運転"
        status_detail = "現在、鹿児島本線は通常通り運行しています。"
        is_delay = false
      else
        # Fallback if structure changes but not explicitly normal or trouble
        # Keep defaults or try to parse generic content? 
        # For safety, default to normal unless trouble is found.
        status_info = "平常運転"
        status_detail = "現在、鹿児島本線は通常通り運行しています。"
      end

      # Weather logic (simplified from original)
      # Assuming simple cache implementation reuse or simplified version
      weather_data = fetch_weather
    rescue => e
      return [500, {'Content-Type' => 'application/json'}, [{ error: e.message }.to_json]]
    end

    # FORCE DEMO MODE (Ensure user sees delay even if scraping fails)
    # status_info = "【遅延情報あり】"
    # status_detail = "【デモ表示】現在、鹿児島本線は人身事故の影響で、上下線に遅れが出ています。"
    # is_delay = true

    res_body = {
      line: "鹿児島本線",
      status: status_info,
      detail: status_detail,
      is_delay: is_delay,
      weather: weather_data,
      timestamp: (Time.now.utc + 9 * 3600).strftime("%H:%M")
    }.to_json

    [200, {'Content-Type' => 'application/json'}, [res_body]]
  end

  def fetch_weather
    # Reuse simple caching logic
    current_time = Time.now
    $weather_last_fetch ||= Time.at(0)
    
    if !defined?($weather_cache) || $weather_cache.nil? || (current_time - $weather_last_fetch) > (30 * 60)
      begin
        lat = 33.81
        lon = 130.54
        weather_url = "https://api.open-meteo.com/v1/forecast?latitude=#{lat}&longitude=#{lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&timezone=Asia/Tokyo&forecast_hours=1"
        json_str = URI.open(weather_url, "User-Agent" => "TrainBoard/1.0").read
        w_data = JSON.parse(json_str)
        
        temp = w_data["current"]["temperature_2m"].round
        prob = w_data["hourly"]["precipitation_probability"][0] rescue 0
        
        $weather_cache = { temp: temp, precip: prob }
        $weather_last_fetch = current_time
      rescue
         return $weather_cache || { temp: "--", precip: "--" }
      end
    end
    $weather_cache || { temp: "--", precip: "--" }
  end

  def ServeFile(path)
    ext = File.extname(path)
    content_type = Rack::Mime.mime_type(ext, 'text/plain')
    [200, {'Content-Type' => content_type}, [File.read(path)]]
  end
end

puts "Server started at http://localhost:#{PORT}"
server = Puma::Server.new(TrainApp.new)
server.add_tcp_listener '0.0.0.0', PORT
begin
  server.add_tcp_listener '::', PORT
rescue
  # Ignore if IPv6 is not available
end
server.run.join
