# Coach-Calistenia-Portatil

Coach de calistenia portátil basado en visión por computadora, publicado en [app.calirepsai.com](https://app.calirepsai.com).

## Publicación y repositorios

- `index.html` y `coach-ui.js` contienen la aplicación de cámara y análisis local. El proyecto de Cloudflare Workers `coach-calistenia-portatil` publica la raíz de `main`. GitHub Pages también publica esa raíz.
- La web principal [calirepsai.com](https://calirepsai.com) se mantiene en el repositorio separado [CaliReps-AI-Website](https://github.com/Charlyred1507/CaliReps-AI-Website). Su proyecto de Cloudflare Workers es `calireps-ai-website` y publica la raíz de ese repositorio.
- `website/` conserva la copia de revisión preparada durante la auditoría de AdSense del 8 de octubre de 2026. Las futuras mejoras de la web principal deben aplicarse en `CaliReps-AI-Website`.

Los enlaces de la aplicación a Quiénes somos, Contacto, Privacidad y Guías abren el sitio principal. Ambos proyectos ya están conectados a GitHub y despliegan los pushes de sus repositorios respectivos sin cambiar sus dominios.

La copia de revisión también se puede consultar en [GitHub Pages](https://charlyred1507.github.io/Coach-Calistenia-Portatil/website/) y [en la app](https://app.calirepsai.com/website/). Para empaquetar esa copia:

```sh
python3 scripts/package-website.py
```

El archivo `dist/calirepsai-website.zip` contiene su `index.html` en la raíz. Para publicar nuevas versiones del sitio principal se debe usar su repositorio dedicado.

La aplicación no sirve anuncios en cámara, resultados automáticos ni historial local. Los ajustes de consentimiento/CMP y las exclusiones de anuncios automáticos se administran en AdSense; hay detalles en [la revisión](docs/adsense-review.md).
