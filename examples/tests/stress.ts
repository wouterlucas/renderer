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

import { type INode } from '@lightningjs/renderer';
import logo from '../assets/lightning.png';
import type { ExampleSettings } from '../common/ExampleSettings.js';

const randomIntBetween = (from: number, to: number) =>
  Math.floor(Math.random() * (to - from + 1) + from);

export default async function ({ renderer }: ExampleSettings) {
  // create 100 nodes
  const nodes: INode[] = [];

  const bg = renderer.createNode({
    width: 1920,
    height: 1080,
    color: 0xff1e293b,
    parent: renderer.root,
  });

  const appLayer = renderer.createNode({
    width: 1920,
    height: 1080,
    parent: bg,
  });

  for (let i = 0; i < 600; i++) {
    const node = renderer.createNode({
      width: 505,
      height: 101,
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      // src: logo,
      // color: 0x000000ff,
      parent: appLayer,
    });

    const imageNode = renderer.createNode({
      width: 500,
      height: 98,
      // color: 0xff00ffff,
      src: logo,
      parent: node,
    });

    nodes.push(node);
  }

  // create animations
  const animate = () => {
    nodes.forEach((node) => {
      node
        .animate(
          {
            x: randomIntBetween(20, 1740),
            y: randomIntBetween(20, 900),
            rotation: Math.random() * Math.PI,
          },
          {
            duration: 3000,
            easing: 'ease-out',
          },
        )
        .start();
    });
  };

  animate();

  setInterval(animate, 3000);
}
