require 'webrick'
require 'open-uri'
require 'net/http'
require 'json'

# ポート設定
PORT = ENV['PORT'] || 8000

# フォルダ構造の自動判定 (デプロイ時のフラット化対策)
# publicフォルダがあればそこをルートに、なければカレントディレクトリをルートにする
root_dir = Dir.exist?('./public') ? './public' : '.'
data_dir = Dir.exist?('./data') ? './data' : '.'

# サーバー設定
server = WEBrick::HTTPServer.new(
  :Port => PORT,
  :BindAddress => '0.0.0.0',
  :DocumentRoot => root_dir,
  :MimeTypes => WEBrick::HTTPUtils::DefaultMimeTypes.merge({"json" => "application/json"})
)

# /data/schedule.json を配信するためのマウント
# dataフォルダがない場合(フラット)は、カレントディレクトリを /data としてマウントし、
# /data/schedule.json へのアクセスを ./schedule.json に繋げる
server.mount('/data', WEBrick::HTTPServlet::FileHandler, data_dir)

# 運行情報取得 API
server.mount_proc '/api/status' do |req, res|
  res.content_type = 'application/json'
  
  begin
    # Yahoo!路線情報 - 九州エリア
    url = 'https://transit.yahoo.co.jp/traininfo/area/7/'
    html = URI.open(url).read

    # 鹿児島本線（九州）の状況を抽出する簡易ロジック
    # 注意: HTML構造が変わると壊れる可能性があります
    status_info = "平常運転"
    status_detail = ""
    is_delay = false

    # 鹿児島本線[門司港―八代] の行を探す
    # 例: <tr><td><a href="...">鹿児島本線[門司港―八代]</a></td><td>...</td></tr>
    if html =~ /鹿児島本線\[門司港―八代\].*?<td>(.*?)<\/td>/m
      raw_status = $1
      
      # タグ除去
      clean_status = raw_status.gsub(/<[^>]+>/, '').strip
      
      if clean_status.include?("遅れ") || clean_status.include?("運転見合わせ")
        status_info = "【遅延情報あり】"
        status_detail = clean_status
        is_delay = true
      else
        status_info = "平常運転"
        status_detail = clean_status
      end
    end

    # Weather fetching (Proxy for old clients) - Open-Meteo API
    # 福岡県宗像市赤間: lat 33.81, lon 130.54
    lat = 33.81
    lon = 130.54
    weather_url = "https://api.open-meteo.com/v1/forecast?latitude=#{lat}&longitude=#{lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&timezone=Asia/Tokyo&forecast_hours=1"
    
    weather_data = { temp: "--", precip: "--" }
    
    begin
      require 'open-uri'
      require 'json'
      
      # Open-Meteo requires User-Agent
      json_str = URI.open(weather_url, "User-Agent" => "TrainBoard/1.0").read
      w_data = JSON.parse(json_str)
      
      temp = w_data["current"]["temperature_2m"].round
      prob = w_data["hourly"]["precipitation_probability"][0] rescue 0
      
      weather_data = { temp: temp, precip: prob }
    rescue => e
      puts "Weather fetch error: #{e.message}"
      # Embed error in json for client-side debug
      weather_data = { temp: "ERR", precip: e.message }
    end

    res.body = {
      line: "鹿児島本線",
      status: status_info,
      detail: status_detail,
      is_delay: is_delay,
      weather: weather_data,
      timestamp: (Time.now.utc + 9 * 3600).strftime("%H:%M")
    }.to_json

  rescue => e
    res.status = 500
    res.body = { error: e.message }.to_json
  end
end

trap 'INT' do server.shutdown end

puts "Server started at http://localhost:#{PORT}"
server.start
