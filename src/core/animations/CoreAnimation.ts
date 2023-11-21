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

import type { CoreNode } from '../CoreNode.js';
import type { INodeAnimatableProps } from '../../main-api/INode.js';
import { getTimingFunction } from '../utils.js';
import { mergeColorProgress } from '../../utils.js';
import { EventEmitter } from '../../common/EventEmitter.js';

export interface AnimationSettings {
  duration: number;
  delay: number;
  easing: string;
  loop: boolean;
  repeat: number;
  repeatDelay: number;
  stopMethod: 'reverse' | 'reset' | false;
}

export class CoreAnimation extends EventEmitter {
  public propStartValues: Partial<INodeAnimatableProps> = {};
  public restoreValues: Partial<INodeAnimatableProps> = {};
  private progress = 0;
  private timingFunction: (t: number) => number | undefined;
  private propsList: Array<keyof INodeAnimatableProps>; //fixme - aint got not time for this

  constructor(
    private node: CoreNode,
    private props: Partial<INodeAnimatableProps>,
    public settings: Partial<AnimationSettings>,
  ) {
    super();
    this.propStartValues = {};
    this.propsList = Object.keys(props) as Array<keyof INodeAnimatableProps>;
    this.propsList.forEach((propName) => {
      this.propStartValues[propName] = node[propName];
    });

    this.timingFunction = (t: number) => t;

    if (settings.easing && typeof settings.easing === 'string') {
      this.timingFunction = getTimingFunction(settings.easing);
    }
  }

  reset() {
    this.progress = 0;
    this.update(0);
  }

  restore() {
    this.reset();
    (Object.keys(this.props) as Array<keyof INodeAnimatableProps>).forEach(
      (propName) => {
        this.node[propName] = this.propStartValues[propName] as number;
      },
    );
  }

  reverse() {
    this.progress = 0;
    (Object.keys(this.props) as Array<keyof INodeAnimatableProps>).forEach(
      (propName) => {
        // set the start value to the current value
        const startValue = this.props[propName];
        const endValue = this.propStartValues[propName] as number;

        // swap the start and end values
        this.props[propName] = endValue;
        this.propStartValues[propName] = startValue;
      },
    );

    // restore stop method if we are not looping
    if (!this.settings.loop) {
      this.settings.stopMethod = false;
    }
  }

  applyEasing(p: number, s: number, e: number): number {
    return (this.timingFunction(p) || p) * (e - s) + s;
  }

  update(dt: number) {
    const { duration, loop, easing } = this.settings;
    if (!duration) {
      this.emit('finished', {});
      return;
    }

    this.progress += dt / duration;

    if (this.progress > 1) {
      this.progress = loop ? 0 : 1;
      return this.emit('finished', {});
    }

    for (let i = 0; i < this.propsList.length; i++) {
      const propName = this.propsList[i] as keyof INodeAnimatableProps;
      const propValue = this.props[propName] as number;
      const startValue = this.propStartValues[propName] as number;
      const endValue = propValue;

      if (propName.indexOf('color') !== -1) {
        // check if we have to change the color to begin with
        if (startValue === endValue) {
          this.node[propName] = startValue;
          continue;
        }

        if (easing) {
          const easingProgressValue =
            this.timingFunction(this.progress) || this.progress;
          const easingColorValue = mergeColorProgress(
            startValue,
            endValue,
            easingProgressValue,
          );
          this.node[propName] = easingColorValue;
          continue;
        }

        this.node[propName] = mergeColorProgress(
          startValue,
          endValue,
          this.progress,
        );
        continue;
      }

      if (easing) {
        this.node[propName] = this.applyEasing(
          this.progress,
          startValue,
          endValue,
        );
        continue;
      }

      this.node[propName] =
        startValue + (endValue - startValue) * this.progress;
    }
  }
}
