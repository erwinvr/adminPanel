"""
Extracción de configuración para FortiGate/FortiOS vía su API REST
nativa — NAPALM no tiene un driver mantenido para Fortinet, así que
este es un cliente propio, chico, en vez de forzar NAPALM donde no
aplica.

Flujo documentado de FortiOS: `/logincheck` con usuario/contraseña deja
una cookie de sesión + un token CSRF (`ccsrftoken`) que hay que mandar
de vuelta en el header `X-CSRFTOKEN` de cualquier request siguiente;
`/api/v2/monitor/system/config/backup` devuelve el archivo de config
completo como texto plano — exactamente lo que necesita el pipeline de
versionamiento/diff ya existente, sin parsear nada acá.
"""

import requests
import urllib3

# Los FortiGate en la práctica casi siempre usan un certificado
# autofirmado en la interfaz de administración — verificar TLS acá
# rompería el caso normal. Se acepta ese trade-off (mismo nivel de
# confianza que el resto de las integraciones de este proyecto, que
# viven en la red interna de administración, no en internet).
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

CONNECT_TIMEOUT_SECONDS = 20


class FortiosExtractionError(Exception):
    pass


def fetch_config(host: str, port: int, username: str, password: str) -> str:
    base_url = f"https://{host}:{port}"
    session = requests.Session()
    session.verify = False

    try:
        login_response = session.post(
            f"{base_url}/logincheck",
            data={"username": username, "secretkey": password},
            timeout=CONNECT_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise FortiosExtractionError(f"No se pudo conectar a la API de FortiGate: {exc}") from exc

    if login_response.status_code != 200 or not login_response.text.strip().startswith('["1"'):
        raise FortiosExtractionError("Login rechazado por FortiGate — revisá usuario y contraseña")

    csrf_token = session.cookies.get("ccsrftoken", "").strip('"')
    if not csrf_token:
        raise FortiosExtractionError("FortiGate no devolvió un token CSRF tras el login")

    try:
        backup_response = session.get(
            f"{base_url}/api/v2/monitor/system/config/backup",
            params={"scope": "global"},
            headers={"X-CSRFTOKEN": csrf_token},
            timeout=CONNECT_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise FortiosExtractionError(f"No se pudo descargar el backup de configuración: {exc}") from exc
    finally:
        try:
            session.post(f"{base_url}/logout", timeout=CONNECT_TIMEOUT_SECONDS)
        except requests.RequestException:
            pass  # cerrar sesión es buena práctica, pero no debe tapar un error real de la descarga

    if backup_response.status_code != 200 or not backup_response.text.strip():
        raise FortiosExtractionError(f"No se pudo obtener el backup de configuración (HTTP {backup_response.status_code})")

    return backup_response.text
