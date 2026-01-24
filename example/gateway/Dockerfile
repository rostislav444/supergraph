FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck and Python dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir \
    fastapi \
    uvicorn \
    httpx \
    pydantic \
    sqlalchemy

# Copy supergraph library
COPY supergraph/ /app/supergraph/

# Copy mvp package init
COPY mvp/__init__.py /app/mvp/__init__.py

# Copy gateway code (only main.py needed)
COPY mvp/gateway/__init__.py /app/mvp/gateway/__init__.py
COPY mvp/gateway/main.py /app/mvp/gateway/main.py

# Set Python path
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run gateway
CMD ["python", "-m", "uvicorn", "mvp.gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
