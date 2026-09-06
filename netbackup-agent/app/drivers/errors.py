"""Error compartido por todos los drivers de extracción — cada driver
levanta esto (no una subclase propia) cuando falla la conexión o la
extracción; `main.py` lo captura una sola vez, sin importar cuántos
drivers existan."""


class NetbackupDriverError(Exception):
    pass
