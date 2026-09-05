"""
Extracción de configuración para Cisco IOS/IOS-XE vía NAPALM.

Un solo punto de entrada (`fetch_config`) que abre la conexión, pide la
config "running" y cierra — sin reintentos ni caché acá, eso lo decide
quien llama (el backend Node ya tiene su propio historial de corridas,
no hace falta duplicar lógica de reintento en este microservicio).
"""

from napalm import get_network_driver

CONNECT_TIMEOUT_SECONDS = 20


class NapalmExtractionError(Exception):
    pass


def fetch_config(host: str, port: int, username: str, password: str) -> str:
    driver_cls = get_network_driver("ios")
    device = driver_cls(
        hostname=host,
        username=username,
        password=password,
        timeout=CONNECT_TIMEOUT_SECONDS,
        optional_args={"port": port},
    )

    try:
        device.open()
        config = device.get_config()
    except Exception as exc:  # napalm expone excepciones de netmiko/paramiko sin una jerarquía propia estable
        raise NapalmExtractionError(
            f"No se pudo conectar/extraer la configuración vía NAPALM (revisá host, puerto y credenciales): {exc}"
        ) from exc
    finally:
        try:
            device.close()
        except Exception:
            pass  # si open() nunca conectó, close() puede fallar — no tapa el error real ya capturado arriba

    running_config = config.get("running", "")
    if not running_config:
        raise NapalmExtractionError("NAPALM se conectó pero no devolvió una configuración 'running' para este equipo")

    return running_config
