# Correcciones de continuidad y memoria de intentos

Las correcciones de continuidad iniciadas sobre `37418a2` se mantienen para los ejercicios disponibles. Los módulos de calibración V11, V12, one-arm V13 y pistol V13.6 conservan sus calibraciones.

- **Front lever y handstand:** un corte mayor que el puente permitido inicia un nuevo hold. Los segmentos anteriores no pueden completar un bloque de cinco segundos después del corte. La duración del puente incluye el intervalo hasta el frame de retorno. Las oclusiones breves siguen usando los límites existentes de 420 y 450 ms.

## Validación

```sh
node tests/rep-state.test.cjs
```

Las 8 pruebas de regresión ejecutan las funciones reales con métricas controladas. Incluyen holds completos después de un corte, límites exactos del puente y observaciones demasiado espaciadas.

También se comprobó en Chromium la carga de todos los módulos actuales. Los archivos de calibración recientes se compararon byte por byte contra la revisión de base.

Estas comprobaciones validan la lógica de estado. No constituyen una medición de precisión sobre los 30 videos del álbum, ni certifican la detección desde todos los ángulos. Los videos y sus metadatos privados se mantienen fuera del repositorio.
