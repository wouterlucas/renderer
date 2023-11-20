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

import { ThreadX, BufferStruct } from '@lightningjs/threadx';
import type {
  INode,
  INodeWritableProps,
  ITextNode,
  ITextNodeWritableProps,
} from '../../main-api/INode.js';
import { NodeStruct, type NodeStructWritableProps } from './NodeStruct.js';
import type { IRenderDriver } from '../../main-api/IRenderDriver.js';
import { ThreadXMainNode } from './ThreadXMainNode.js';
import { assertTruthy } from '../../utils.js';
import type {
  RendererMain,
  RendererMainSettings,
} from '../../main-api/RendererMain.js';
import type {
  ThreadXRendererInitMessage,
  ThreadXRendererReleaseTextureMessage,
} from './ThreadXRendererMessage.js';
import {
  TextNodeStruct,
  type TextNodeStructWritableProps,
} from './TextNodeStruct.js';
import { ThreadXMainTextNode } from './ThreadXMainTextNode.js';

export interface ThreadXRendererSettings {
  coreWorkerUrl: string;
}

export class ThreadXRenderDriver implements IRenderDriver {
  private settings: ThreadXRendererSettings;
  private threadx: ThreadX;
  private rendererMain: RendererMain | null = null;
  private root: INode | null = null;

  constructor(settings: ThreadXRendererSettings) {
    this.settings = settings;
    this.threadx = ThreadX.init({
      workerId: 1,
      workerName: 'main',
      sharedObjectFactory: (buffer) => {
        const typeId = BufferStruct.extractTypeId(buffer);
        const rendererMain = this.rendererMain;
        assertTruthy(rendererMain);
        if (typeId === NodeStruct.typeId) {
          const nodeStruct = new NodeStruct(buffer);
          return nodeStruct.lock(() => {
            return new ThreadXMainNode(rendererMain, nodeStruct);
          });
        } else if (typeId === TextNodeStruct.typeId) {
          const nodeStruct = new TextNodeStruct(buffer);
          return nodeStruct.lock(() => {
            return new ThreadXMainTextNode(rendererMain, nodeStruct);
          });
        }
        return null;
      },
    });
    this.threadx.registerWorker(
      'renderer',
      new Worker(this.settings.coreWorkerUrl, { type: 'module' }),
    );
  }

  async init(
    rendererMain: RendererMain,
    rendererSettings: Required<RendererMainSettings>,
    canvas: HTMLCanvasElement,
  ): Promise<void> {
    this.rendererMain = rendererMain;
    const offscreenCanvas = canvas.transferControlToOffscreen();
    const rootNodeId = (await this.threadx.sendMessageAsync(
      'renderer',
      {
        type: 'init',
        canvas: offscreenCanvas,
        appWidth: rendererSettings.appWidth,
        appHeight: rendererSettings.appHeight,
        deviceLogicalPixelRatio: rendererSettings.deviceLogicalPixelRatio,
        devicePhysicalPixelRatio: rendererSettings.devicePhysicalPixelRatio,
        clearColor: rendererSettings.clearColor,
        coreExtensionModule: rendererSettings.coreExtensionModule,
        pauseRaf: rendererSettings.pauseRaf,
      } satisfies ThreadXRendererInitMessage,
      [offscreenCanvas],
    )) as number;
    // The Render worker shares the root node with this worker during the
    // 'init' call above. That call returns the ID of the root node, which
    // we can use to retrieve it from the shared object store.
    const rootNode = this.threadx.getSharedObjectById(rootNodeId);
    assertTruthy(
      rootNode instanceof ThreadXMainNode,
      'Unexpected root node type',
    );
    this.root = rootNode;
  }

  getRootNode(): INode {
    assertTruthy(this.root, 'Driver not initialized');
    return this.root;
  }

  createNode(props: INodeWritableProps): INode {
    const rendererMain = this.rendererMain;
    assertTruthy(rendererMain);
    const bufferStruct = new NodeStruct();
    Object.assign(bufferStruct, {
      // Node specific properties
      x: props.x,
      y: props.y,
      width: props.width,
      height: props.height,
      parentId: props.parent ? props.parent.id : 0,
      clipping: props.clipping,
      color: props.color,
      colorTop: props.colorTop,
      colorRight: props.colorBottom,
      colorBottom: props.colorBottom,
      colorLeft: props.colorLeft,
      colorTl: props.colorTl,
      colorTr: props.colorTr,
      colorBl: props.colorBl,
      colorBr: props.colorBr,
      alpha: props.alpha,
      zIndex: props.zIndex,
      zIndexLocked: props.zIndexLocked,
      scaleX: props.scaleX,
      scaleY: props.scaleY,
      mount: props.mount,
      mountX: props.mountX,
      mountY: props.mountY,
      pivot: props.pivot,
      pivotX: props.pivotX,
      pivotY: props.pivotY,
      rotation: props.rotation,
    } satisfies NodeStructWritableProps);

    const node = new ThreadXMainNode(rendererMain, bufferStruct);
    node.once('beforeDestroy', this.onBeforeDestroyNode.bind(this, node));
    this.threadx.shareObjects('renderer', [node]).catch(console.error);
    node.shader = props.shader ?? null;
    node.texture = props.texture ?? null;
    node.src = props.src ?? '';
    this.onCreateNode(node);
    return node;
  }

  createTextNode(props: ITextNodeWritableProps): ITextNode {
    const rendererMain = this.rendererMain;
    assertTruthy(rendererMain);
    const bufferStruct = new TextNodeStruct();

    Object.assign(bufferStruct, {
      // Node specific properties
      x: props.x,
      y: props.y,
      width: props.width,
      height: props.height,
      parentId: props.parent ? props.parent.id : 0,
      clipping: props.clipping,
      color: props.color,
      colorTop: props.colorTop,
      colorRight: props.colorBottom,
      colorBottom: props.colorBottom,
      colorLeft: props.colorLeft,
      colorTl: props.colorTl,
      colorTr: props.colorTr,
      colorBl: props.colorBl,
      colorBr: props.colorBr,
      alpha: props.alpha,
      zIndex: props.zIndex,
      zIndexLocked: props.zIndexLocked,
      scaleX: props.scaleX,
      scaleY: props.scaleY,
      mount: props.mount,
      mountX: props.mountX,
      mountY: props.mountY,
      pivot: props.pivot,
      pivotX: props.pivotX,
      pivotY: props.pivotY,
      rotation: props.rotation,

      // Text specific properties
      text: props.text,
      textRendererOverride: props.textRendererOverride,
      fontSize: props.fontSize,
      fontFamily: props.fontFamily,
      fontWeight: props.fontWeight,
      fontStretch: props.fontStretch,
      fontStyle: props.fontStyle,
      contain: props.contain,
      letterSpacing: props.letterSpacing,
      offsetY: props.offsetY,
      textAlign: props.textAlign,
      scrollable: props.scrollable,
      scrollY: props.scrollY,
    } satisfies TextNodeStructWritableProps);

    const node = new ThreadXMainTextNode(rendererMain, bufferStruct);
    node.once('beforeDestroy', this.onBeforeDestroyNode.bind(this, node));
    this.threadx.shareObjects('renderer', [node]).catch(console.error);

    node.shader = props.shader ?? null;
    node.texture = props.texture ?? null;
    node.src = props.src ?? '';
    node.debug = props.debug ?? {};

    this.onCreateNode(node);
    return node;
  }

  // TODO: Remove?
  destroyNode(node: INode): void {
    node.destroy();
  }

  releaseTexture(textureDescId: number): void {
    this.threadx.sendMessage('renderer', {
      type: 'releaseTexture',
      textureDescId,
    } satisfies ThreadXRendererReleaseTextureMessage);
  }

  onCreateNode(node: INode): void {
    return;
  }

  onBeforeDestroyNode(node: INode): void {
    return;
  }
}
