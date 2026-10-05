/**
 * The app action names, without their schemas. The voice runner needs only
 * the names to tell actions from catalog tools, so the page does not load
 * every action's argument schema for it. actionSchemas.test.mjs keeps this
 * list equal to VANTAGE_ACTION_SCHEMAS.
 */
export const VANTAGE_ACTION_NAMES = Object.freeze([
  'fly_to_location',
  'select_nearest_aircraft',
  'adjust_camera_zoom',
  'zoom_to_globe',
  'set_layer_visibility',
  'show_data_layers_menu',
  'set_panel_open',
  'set_context_mode',
  'control_cockpit',
  'set_visual_style',
  'get_entity_context',
  'get_current_view_state',
  'set_hud',
  'set_cyber_sonar',
  'set_detection',
  'set_map_stack',
  'set_post_processing',
  'control_scene',
  'control_cctv',
  'control_radio',
  'track_entity',
  'stop_tracking',
  'frame_overhead',
  'annotate_map',
  'clear_annotations',
  'move_camera',
  'fly_route',
  'analyst_query',
  'next_iss_pass',
  'next_satellite_pass',
]);
