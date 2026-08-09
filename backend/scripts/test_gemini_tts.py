"""
One-shot Gemini TTS verification.
No retries. No LiteLLM. No Vertex. Direct REST only.
"""
import os, requests, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

key = os.getenv('GEMINI_API_KEY', '')
if not key:
    print('GEMINI_API_KEY not set')
    exit(1)

MODEL = 'gemini-3.1-flash-tts-preview'
URL = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent'

payload = {
    "contents": [{"role": "user", "parts": [{"text": "Welcome to this lesson."}]}],
    "generationConfig": {
        "responseModalities": ["AUDIO"],
        "speechConfig": {
            "voiceConfig": {
                "prebuiltVoiceConfig": {"voiceName": "Kore"}
            }
        }
    }
}

print(f'\nTesting: {MODEL}')
print(f'URL: {URL}')
print(f'Key prefix: {key[:12]}...\n')

r = requests.post(
    URL,
    headers={'x-goog-api-key': key, 'Content-Type': 'application/json'},
    json=payload,
    timeout=20
)

print(f'HTTP Status: {r.status_code}')

if r.status_code == 200:
    data = r.json()
    # Check if audio data is present
    try:
        parts = data['candidates'][0]['content']['parts']
        for part in parts:
            if 'inlineData' in part:
                audio_data = part['inlineData']
                mime = audio_data.get('mimeType', 'unknown')
                # base64 data length / 1.33 ≈ bytes
                b64_len = len(audio_data.get('data', ''))
                approx_bytes = int(b64_len * 0.75)
                print(f'✓ AUDIO RECEIVED')
                print(f'  MIME type: {mime}')
                print(f'  Approx size: {approx_bytes:,} bytes ({approx_bytes//1024} KB)')
                print(f'\nRESULT: Gemini TTS works. Proceed with implementation.')
            elif 'text' in part:
                print(f'WARNING: Got text response instead of audio: {part["text"][:100]}')
    except (KeyError, IndexError) as e:
        print(f'Unexpected response structure: {e}')
        print(json.dumps(data, indent=2)[:500])

elif r.status_code == 429:
    err = r.json().get('error', {})
    violations = []
    for d in err.get('details', []):
        for v in d.get('violations', []):
            violations.append({
                'quotaId': v.get('quotaId', ''),
                'metric': v.get('quotaMetric', ''),
            })
    retry = None
    for d in err.get('details', []):
        if 'retryDelay' in str(d):
            retry = d.get('retryDelay', 'unknown')

    print(f'RESULT: 429 RESOURCE_EXHAUSTED')
    print(f'Message: {err.get("message","")[:200]}')
    print(f'Retry delay: {retry}')
    print(f'Quota violations:')
    for v in violations:
        print(f'  - {v["quotaId"]}')
        # Check if limit is 0 (project-level disabled) vs rate limit
        if 'PerDay' in v['quotaId']:
            print(f'    → Daily quota exhausted or limit=0 for this project')
        elif 'PerMinute' in v['quotaId']:
            print(f'    → Per-minute rate limit hit')
    print(f'\nDO NOT implement Gemini TTS yet — quota not available.')

elif r.status_code == 404:
    err = r.json().get('error', {})
    print(f'RESULT: 404 NOT FOUND')
    print(f'Message: {err.get("message","")[:200]}')
    print(f'\nModel does not exist or is not accessible. Do not add to production.')

elif r.status_code == 403:
    err = r.json().get('error', {})
    print(f'RESULT: 403 FORBIDDEN')
    print(f'Message: {err.get("message","")[:200]}')
    print(f'\nAccess denied. Do not add to production.')

else:
    print(f'RESULT: Unexpected status {r.status_code}')
    print(r.text[:300])
