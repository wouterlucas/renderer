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

/**
 * Platform render loop initiator
 */
export const startLoop = (stage: Stage, pauseRaf: boolean) => {
  let lastFrameTime = getTimeStamp();

  const runLoop = () => {
    const startTimestamp = getTimeStamp();
    const rafTimeInMs = startTimestamp - lastFrameTime;

    stage.updateAnimations();
    const animationTimeMs = getTimeStamp() - startTimestamp;

    if (pauseRaf && !stage.hasSceneUpdates()) {
      console.log('pausing raf');
      setTimeout(runLoop, 1000 / 60);
      lastFrameTime = getTimeStamp();
      return;
    }

    const drawTimestamp = getTimeStamp();
    stage.drawFrame();
    const drawTime = getTimeStamp() - drawTimestamp;
    const delta = getTimeStamp() - lastFrameTime;
    const fps = Math.round(1000 / delta);

    // console.log(`draw time: ${rts(drawTime)}ms, animations: ${rts(animationTimeMs)}ms, rafTime: ${rts(rafTimeInMs)}ms, total: ${rts(delta)}ms (fps: ${fps}})`);

    lastFrameTime = getTimeStamp();
    requestAnimationFrame(runLoop);
  };
  requestAnimationFrame(runLoop);
};

export const rts = (timeStamp: number) => {
  return Math.round(timeStamp * 1000) / 1000;
};

/**
 * Return unix timestamp
 * @return {number}
 */
export const getTimeStamp = () => {
  return performance ? performance.now() : Date.now();
};
