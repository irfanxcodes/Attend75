# Backend Setup (FastAPI)

## 1. Create and activate virtual environment

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```

## 2. Install dependencies

```bash
pip install -r requirements.txt
```

## 3. Run server

```bash
uvicorn app:app --reload
```

Server starts at `http://127.0.0.1:8000`.

## API

### `POST /login`

Request body:

```json
{
  "roll_number": "string",
  "password": "string"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Login successful",
  "data": {}
}
```

Error response:

```json
{
  "status": "error",
  "message": "Invalid credentials"
}
```
