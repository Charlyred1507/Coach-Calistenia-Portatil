# Correcciones de continuidad y memoria de intentos

Esta revisión parte de `37418a2` y conserva los módulos de calibración V11, V12, one-arm V13 y pistol V13.6, así como `coach-ui.js`, sin modificaciones.

- **Front lever y handstand:** un corte mayor que el puente permitido inicia un nuevo hold. Los segmentos anteriores no pueden completar un bloque de cinco segundos después del corte. La duración del puente incluye el intervalo hasta el frame de retorno. Las oclusiones breves siguen usando los límites existentes de 420 y 450 ms.
- **Desplantes:** regresar arriba sin confirmar profundidad cierra el intento incompleto. Sus mínimos de rodilla/cadera no se combinan con el descenso de pelvis de otro intento. La pierna de descanso extendida y la pérdida breve de la pierna trabajada no se interpretan como regreso completo.
- **Reinicio y seguimiento:** los desplantes descartan su estado al reiniciar, perder el seguimiento o retroceder el tiempo del video.

## Validación

```sh
node tests/rep-state.test.cjs
```

Las 14 pruebas de regresión ejecutan las funciones reales con métricas controladas. Incluyen holds completos después de un corte, límites exactos del puente, descensos insuficientes separados, reps completas consecutivas, ambas piernas visibles, oclusión de la pierna trabajada y reinicio del intento.

También se comprobó en Chromium la carga de todos los módulos actuales y los reinicios mediante los eventos reales de la app. Los archivos de calibración recientes se compararon byte por byte contra la revisión de base.

Estas comprobaciones validan la lógica de estado. No constituyen una medición de precisión sobre los 30 videos del álbum, ni certifican la detección desde todos los ángulos. Los videos y sus metadatos privados se mantienen fuera del repositorio.
