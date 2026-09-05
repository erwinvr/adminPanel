# syntax=docker/dockerfile:1
#
# python:3.12-slim (Debian) a propósito, NO alpine: napalm arrastra
# netmiko/paramiko/cryptography, que en alpine (musl) obligan a
# compilar desde fuente (gcc, headers) — en una base glibc como esta,
# pip instala wheels prearmadas y listo.

FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN groupadd --system appgroup && useradd --system --gid appgroup --no-create-home appuser
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
