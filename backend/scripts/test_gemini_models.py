"""Test which Gemini models actually work with the current API key."""
import os, requests
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

key = os.getenv('GEMINI_API_KEY', '')
if not key:
    print('GEMINI_API_KEY not set')
    exit(1)

models_to_test = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
]

print('\nTesting Gemini models...\n')
for model in models_to_test:
    try:
        r = requests.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            headers={'x-goog-api-key': key, 'Content-Type': 'application/json'},
            json={
                'contents': [{'role': 'user', 'parts': [{'text': 'Reply OK'}]}],
                'generationConfig': {'maxOutputTokens': 5}
            },
            timeout=8
        )
        if r.status_code == 200:
            text = r.json()['candidates'][0]['content']['parts'][0]['text'].strip()
            print(f'  OK   {model}: {text!r}')
        else:
            err = r.json().get('error', {})
            status = err.get('status', str(r.status_code))
            msg = err.get('message', '')[:70]
            print(f'  FAIL {model}: {status} - {msg}')
    except requests.Timeout:
        print(f'  TIMEOUT {model}')
    except Exception as e:
        print(f'  ERROR {model}: {str(e)[:60]}')
