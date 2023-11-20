/*
 * If not stated otherwise in this file or this component's LICENSE file the
 * following copyright and licenses apply:
 *
 * Copyright 2023 Comcast Cable Communications Management, LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Stage } from './Stage.js';

let _pauseRaf = false;

const loop = (stage: Stage) => {
  const runLoop = () => {
    if (_pauseRaf && !stage.hasSceneUpdates()) {
      return pause(stage);
    }

    // emit('frameStart');
    stage.drawFrame();
    requestAnimationFrame(runLoop);
  };
  requestAnimationFrame(runLoop);
};

const pause = (stage: Stage) => {
  const runPause = () => {
    stage.updateAnimations();

    if (stage.hasSceneUpdates()) {
      return loop(stage);
    }

    setTimeout(runPause, 1000 / 60);
  };
  runPause();
};

/**
 * Platform render loop initiator
 */
export const startLoop = (stage: Stage, pauseRaf: boolean) => {
  _pauseRaf = pauseRaf;
  loop(stage);
};

/**
 * Return unix timestamp
 * @return {number}
 */
export const getTimeStamp = () => {
  return performance ? performance.now() : Date.now();
};
