"""
netbackup-agent — microservicio interno para los dos drivers de
"Backup Networking" que no se resuelven con SSH crudo (ver
backend/src/integrations/networkBackup/sshClient.js para ese caso, que
sigue viviendo en el backend Node): `napalm_ios` (Cisco IOS/IOS-XE) y
`fortios_api` (FortiGate/FortiOS).

Un solo endpoint, sin persistencia ni autenticación propia — confía en
que solo el backend Node lo alcanza por la red interna de Docker
Compose (mismo modelo de confianza que tiene hoy la base de datos:
sin puerto publicado en producción).
"""

from typing import Literal

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.drivers.fortios_driver import FortiosExtractionError
from app.drivers.fortios_driver import fetch_config as fetch_fortios_config
from app.drivers.napalm_driver import NapalmExtractionError
from app.drivers.napalm_driver import fetch_config as fetch_napalm_config

app = FastAPI(title="netbackup-agent")


class ExtractRequest(BaseModel):
    driver: Literal["napalm_ios", "fortios_api"]
    host: str
    port: int
    username: str
    password: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/extract")
def extract(payload: ExtractRequest):
    try:
        if payload.driver == "napalm_ios":
            config = fetch_napalm_config(payload.host, payload.port, payload.username, payload.password)
        else:
            config = fetch_fortios_config(payload.host, payload.port, payload.username, payload.password)
    except (NapalmExtractionError, FortiosExtractionError) as exc:
        return JSONResponse(status_code=502, content={"error": str(exc)})

    return {"config": config}
