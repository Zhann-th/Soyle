import os
import tempfile
import subprocess
from flask import Flask, request, jsonify
from flask_cors import CORS
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
print("⏳ Загрузка модели Whisper (подождите первый раз)...")
import whisper
model = whisper.load_model("base")  
print("✅ Whisper модель загружена! Сервер готов.")
@app.route('/')
def index():
    return app.send_static_file('index.html')
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    audio_file = request.files['audio']
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
        tmp_path = tmp.name
        audio_file.save(tmp_path)
    wav_path = tmp_path.replace('.webm', '.wav')
    try:
        subprocess.run([
            'ffmpeg', '-y', '-i', tmp_path, '-ar', '16000', '-ac', '1', wav_path
        ], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        wav_path = tmp_path
    try:
        result = model.transcribe(wav_path, language='kk', task='transcribe')
        detected_language = result.get('language', 'kk')
        text = result.get('text', '').strip()
        return jsonify({
            'text': text,
            'language': detected_language
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
            if wav_path != tmp_path:
                os.unlink(wav_path)
        except Exception:
            pass
if __name__ == '__main__':
    print("🚀 QazVoice запущен: http://localhost:5050")
    app.run(host='0.0.0.0', port=5050, debug=False)