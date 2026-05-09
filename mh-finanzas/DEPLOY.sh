#!/bin/bash
# MH Finanzas — deploy script
# Ejecutá esto desde la carpeta mh-finanzas/

echo "=== MH Finanzas Deploy ==="
echo ""

# 1. Instalar Netlify CLI si no está
if ! command -v netlify &> /dev/null; then
  echo "Instalando Netlify CLI..."
  npm install -g netlify-cli
fi

# 2. Login (abre el browser)
echo "Iniciando sesión en Netlify (se abre el browser)..."
netlify login

# 3. Vincular al sitio existente
echo "Vinculando al sitio mh-finanzas..."
netlify link --name mh-finanzas

# 4. Deploy
echo "Deployando..."
netlify deploy --prod

echo ""
echo "=== Deploy listo ==="
echo "URL: https://mh-finanzas.netlify.app"
