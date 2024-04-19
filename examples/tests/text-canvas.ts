import type { ExampleSettings } from '../common/ExampleSettings.js';

export async function automation(settings: ExampleSettings) {
  await test(settings);
  await settings.snapshot();
}

const randomIntBetween = (from: number, to: number) =>
  Math.floor(Math.random() * (to - from + 1) + from);

/**
 * Tests that Single-Channel Signed Distance Field (SSDF) fonts are rendered
 * correctly.
 *
 * Text that is thinner than the certified snapshot may indicate that the
 * SSDF font atlas texture was premultiplied before being uploaded to the GPU.
 *
 * @param settings
 * @returns
 */
export default async function test(settings: ExampleSettings) {
  const { renderer, testRoot } = settings;

  // Set a smaller snapshot area
  // testRoot.width = 200;
  // testRoot.height = 200;
  // testRoot.color = 0xffffffff;

  const nodes: any[] = [];

  const renderNode = (t: string) => {
    const node = renderer.createTextNode({
      x: Math.random() * 1900,
      y: Math.random() * 1080,
      text: 'CANVAS ' + t,
      color: 0x000000ff,
      fontFamily: 'sans-serif',
      parent: testRoot,
      fontSize: 80,
    });

    nodes.push(node);
  };

  const spawn = (amount = 100) => {
    for (let i = 0; i < amount; i++) {
      renderNode(i.toString());
    }
  };

  const despawn = (amount = 100) => {
    for (let i = 0; i < amount; i++) {
      const node = nodes.pop();
      node.destroy();
    }
  };

  const move = () => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      node.x = randomIntBetween(0, 1900);
      node.y = randomIntBetween(0, 1080);
    }
  };

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      spawn();
    } else if (event.key === 'ArrowDown') {
      despawn();
    } else if (event.key === 'ArrowLeft') {
      move();
    } else if (event.key === 'ArrowRight') {
      move();
    }
  });

  spawn();
}
