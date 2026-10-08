# Coach-Calistenia-Portatil
Coach de calistenia portátil basado en AI y vision studio

El repositorio contiene dos entregables:

- `index.html` y `coach-ui.js`: aplicación de cámara y análisis local. GitHub Pages publica la raíz de `main`.
- `website/`: web informativa de CaliReps AI, recuperada de la versión pública de `calirepsai.com` y mantenida aquí. Incluye Quiénes somos, Contacto, Privacidad, Términos y 14 guías.

La web se puede revisar en [GitHub Pages](https://charlyred1507.github.io/Coach-Calistenia-Portatil/website/). Sus enlaces relativos permiten publicarla tanto en esa subcarpeta como en la raíz de `calirepsai.com`.

Para generar el paquete de publicación:

```sh
python3 scripts/package-website.py
```

El archivo `dist/calirepsai-website.zip` contiene `index.html` en la raíz y se puede subir al proyecto existente de Cloudflare Pages. Si Pages se conecta a este repositorio, el directorio de salida del sitio informativo debe ser `website`, sin compilación. Publicar en GitHub Pages no actualiza por sí solo el dominio de Cloudflare.

La aplicación no sirve anuncios en cámara, resultados automáticos ni historial local. El código de AdSense se conserva en las páginas editoriales de la web. Los ajustes de consentimiento/CMP y las exclusiones de anuncios automáticos se administran en AdSense; hay detalles en [la revisión](docs/adsense-review.md).
