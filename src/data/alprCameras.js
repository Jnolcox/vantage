import { defaultSurface } from './surfaceServices.js';
import { createApplicationAlpr } from '../app/layers/alprCameras.js';
import { createSourceSlot } from '../sources/sourceSlot.js';
import { createAlprSource } from '../layers/alpr/index.js';
export * from '../layers/alpr/index.js';
const slot = createSourceSlot(createAlprSource(), ['fetch'], 'ALPR source', {
  destroy: () => {},
  detailZoom: () => null,
});
export const configureAlprSource = slot.configure;
export default createApplicationAlpr({
  surface: defaultSurface,
  source: slot.source,
});
