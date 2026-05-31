FROM python:3.11-slim

WORKDIR /app

# Copy and install requirements first (better caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend source files
COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
