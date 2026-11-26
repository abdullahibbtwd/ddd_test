# Bake garage.prod.toml into the image so Coolify does not bind-mount a host
# path (missing file → Docker creates a directory → "not a directory" on start).
FROM dxflrs/garage:v2.5.0
COPY garage.prod.toml /etc/garage.toml
