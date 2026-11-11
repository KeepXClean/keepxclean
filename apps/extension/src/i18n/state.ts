import type { UILocaleSetting } from '@keepxclean/shared';

let activeLocaleSetting: UILocaleSetting = 'auto';

export function setActiveLocaleSetting(setting: UILocaleSetting) {
  activeLocaleSetting = setting;
}

export function getActiveLocaleSetting(): UILocaleSetting {
  return activeLocaleSetting;
}
