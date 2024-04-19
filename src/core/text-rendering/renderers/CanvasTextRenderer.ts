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

import { EventEmitter } from '../../../common/EventEmitter.js';
import { assertTruthy, mergeColorAlphaPremultiplied } from '../../../utils.js';
import type { Stage } from '../../Stage.js';
import type { Matrix3d } from '../../lib/Matrix3d.js';
import {
  intersectRect,
  type Bound,
  intersectBound,
  getNormalizedRgbaComponents,
  type Rect,
  getNormalizedAlphaComponent,
  type BoundWithValid,
  createBound,
  type RectWithValid,
} from '../../lib/utils.js';
import type { ImageTexture } from '../../textures/ImageTexture.js';
import type { TrFontFace } from '../font-face-types/TrFontFace.js';
import { WebTrFontFace } from '../font-face-types/WebTrFontFace.js';
import {
  LightningTextTextureRenderer,
  type RenderInfo,
} from './LightningTextTextureRenderer.js';
import {
  TextRenderer,
  type TextRendererState,
  type TrFontProps,
  type TrPropSetters,
  type TrProps,
} from './TextRenderer.js';

const resolvedGlobal = typeof self === 'undefined' ? globalThis : self;

/**
 * Global font set regardless of if run in the main thread or a web worker
 */
const globalFontSet = ((resolvedGlobal.document as any)?.fonts ||
  (resolvedGlobal as any).fonts) as FontFaceSet;

declare module './TextRenderer.js' {
  interface TextRendererMap {
    canvas: CanvasTextRenderer;
  }
}

interface CanvasPageInfo {
  texture: ImageTexture | undefined;
  lineNumStart: number;
  lineNumEnd: number;
  valid: boolean;
}

function getFontCssString(props: TrProps): string {
  const { fontFamily, fontStyle, fontWeight, fontStretch, fontSize } = props;
  return [fontStyle, fontWeight, fontStretch, `${fontSize}px`, fontFamily].join(
    ' ',
  );
}

function getFontCacheString(props: TrProps): string {
  const { fontFamily, fontStyle, fontWeight, fontStretch } = props;
  return [fontFamily, fontWeight, fontStyle, fontStretch].join(' ');
}

export interface CanvasTextRendererState extends TextRendererState {
  props: TrProps;

  fontFaceLoadedHandler: (() => void) | undefined;
  fontInfo:
    | {
        cssString: string;
        loaded: boolean;
      }
    | undefined;
  lightning2TextRenderer: LightningTextTextureRenderer;
  canvasPageInfo: CanvasPageInfo | undefined;
  renderInfo: RenderInfo | undefined;
  renderWindow: Bound | undefined;
  visibleWindow: BoundWithValid;
}

/**
 * Ephemeral bounds object used for intersection calculations
 *
 * @remarks
 * Used to avoid creating a new object every time we need to intersect
 * element bounds.
 */
const tmpElementBounds = createBound(0, 0, 0, 0);

export class CanvasTextRenderer extends TextRenderer<CanvasTextRendererState> {
  protected canvas: OffscreenCanvas | HTMLCanvasElement;
  protected context:
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D;
  private rendererBounds: Bound;
  private fontMap = new Map<string, boolean>();
  private pageInfo: CanvasPageInfo | null = null;

  totalRenderTime: any;

  constructor(stage: Stage) {
    console.log('New CanvasTextRenderer');
    super(stage);
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(0, 0);
    } else {
      this.canvas = document.createElement('canvas');
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    let context = this.canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!context) {
      // A browser may appear to support OffscreenCanvas but not actually support the Canvas '2d' context
      // Here we try getting the context again after falling back to an HTMLCanvasElement.
      // See: https://github.com/lightning-js/renderer/issues/26#issuecomment-1750438486
      this.canvas = document.createElement('canvas');
      context = this.canvas.getContext('2d');
    }
    assertTruthy(context);
    this.context = context;
    this.rendererBounds = {
      x1: 0,
      y1: 0,
      x2: this.stage.options.appWidth,
      y2: this.stage.options.appHeight,
    };
  }

  //#region Overrides
  override getPropertySetters(): Partial<
    TrPropSetters<CanvasTextRendererState>
  > {
    return {
      fontFamily: (state, value) => {
        state.props.fontFamily = value;
        state.fontInfo = undefined;
        this.invalidateLayoutCache(state);
      },
      fontWeight: (state, value) => {
        state.props.fontWeight = value;
        state.fontInfo = undefined;
        this.invalidateLayoutCache(state);
      },
      fontStyle: (state, value) => {
        state.props.fontStyle = value;
        state.fontInfo = undefined;
        this.invalidateLayoutCache(state);
      },
      fontStretch: (state, value) => {
        state.props.fontStretch = value;
        state.fontInfo = undefined;
        this.invalidateLayoutCache(state);
      },
      fontSize: (state, value) => {
        state.props.fontSize = value;
        state.fontInfo = undefined;
        this.invalidateLayoutCache(state);
      },
      text: (state, value) => {
        state.props.text = value;
        this.invalidateLayoutCache(state);
      },
      textAlign: (state, value) => {
        state.props.textAlign = value;
        this.invalidateLayoutCache(state);
      },
      color: (state, value) => {
        state.props.color = value;
        this.invalidateLayoutCache(state);
      },
      x: (state, value) => {
        state.props.x = value;
        this.invalidateVisibleWindowCache(state);
      },
      y: (state, value) => {
        state.props.y = value;
        this.invalidateVisibleWindowCache(state);
      },
      contain: (state, value) => {
        state.props.contain = value;
        this.invalidateLayoutCache(state);
      },
      width: (state, value) => {
        state.props.width = value;
        // Only invalidate layout cache if we're containing in the horizontal direction
        if (state.props.contain !== 'none') {
          this.invalidateLayoutCache(state);
        }
      },
      height: (state, value) => {
        state.props.height = value;
        // Only invalidate layout cache if we're containing in the vertical direction
        if (state.props.contain === 'both') {
          this.invalidateLayoutCache(state);
        }
      },
      offsetY: (state, value) => {
        state.props.offsetY = value;
        this.invalidateLayoutCache(state);
      },
      scrollY: (state, value) => {
        state.props.scrollY = value;
      },
      letterSpacing: (state, value) => {
        state.props.letterSpacing = value;
        this.invalidateLayoutCache(state);
      },
      lineHeight: (state, value) => {
        state.props.lineHeight = value;
        this.invalidateLayoutCache(state);
      },
      maxLines: (state, value) => {
        state.props.maxLines = value;
        this.invalidateLayoutCache(state);
      },
      textBaseline: (state, value) => {
        state.props.textBaseline = value;
        this.invalidateLayoutCache(state);
      },
      verticalAlign: (state, value) => {
        state.props.verticalAlign = value;
        this.invalidateLayoutCache(state);
      },
      overflowSuffix: (state, value) => {
        state.props.overflowSuffix = value;
        this.invalidateLayoutCache(state);
      },
      // debug: (state, value) => {
      //   state.props.debug = value;
      // },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override canRenderFont(props: TrFontProps): boolean {
    // The canvas renderer can render any font because it automatically
    // falls back to system fonts. The CanvasTextRenderer should be
    // checked last if other renderers are preferred.
    return true;
  }

  override isFontFaceSupported(fontFace: TrFontFace): boolean {
    return fontFace instanceof WebTrFontFace;
  }

  override addFontFace(fontFace: TrFontFace): void {
    // Make sure the font face is an Canvas font face (it should have already passed
    // the `isFontFaceSupported` check)
    assertTruthy(fontFace instanceof WebTrFontFace);

    // We simply add the font face to the document
    // @ts-expect-error `add()` method should be available from a FontFaceSet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    globalFontSet.add(fontFace.fontFace);
  }

  loadFont(state: CanvasTextRendererState) {
    const fontCssString = getFontCssString(state.props);
    const fontCacheString = getFontCacheString(state.props);

    state.fontInfo = {
      cssString: fontCssString,
      loaded: false,
    };

    if (this.fontMap.has(fontCacheString)) {
      console.log('Font already loaded', fontCssString);
      state.fontInfo.loaded = true;
      this.scheduleUpdateState(state);
      return;
    }

    console.log('Loading font', fontCssString);
    globalFontSet
      .load(fontCssString)
      .then(this.onFontLoaded.bind(this, state, fontCssString, fontCacheString))
      .catch(
        this.onFontLoadError.bind(this, state, fontCssString, fontCacheString),
      );
    return;
  }

  calculateRenderInfo(state: CanvasTextRendererState): RenderInfo {
    const maxLines = state.props.maxLines;
    let containedMaxLines = 0;
    let calcMaxLines = 0;

    console.log(
      'Calculating render info',
      state.props.text,
      state.props.width,
      state.props.height,
      state.props.contain,
      state.props.offsetY,
      state.props.lineHeight,
      state.props.maxLines,
    );

    if (state.props.contain === 'both') {
      containedMaxLines = Math.floor(
        (state.props.height - state.props.offsetY) / state.props.lineHeight,
      );

      if (containedMaxLines > 0 && maxLines > 0) {
        calcMaxLines = Math.min(containedMaxLines, maxLines);
      } else {
        calcMaxLines = Math.max(containedMaxLines, maxLines);
      }
    }

    state.lightning2TextRenderer.settings = {
      text: state.props.text,
      textAlign: state.props.textAlign,
      fontFace: state.props.fontFamily,
      fontSize: state.props.fontSize,
      fontStyle: [
        state.props.fontStretch,
        state.props.fontStyle,
        state.props.fontWeight,
      ].join(' '),
      textColor: getNormalizedRgbaComponents(state.props.color),
      offsetY: state.props.fontSize + state.props.offsetY,
      wordWrap: state.props.contain !== 'none',
      wordWrapWidth:
        state.props.contain === 'none' ? undefined : state.props.width,
      letterSpacing: state.props.letterSpacing,
      lineHeight: state.props.lineHeight,
      maxLines: calcMaxLines,
      textBaseline: state.props.textBaseline,
      verticalAlign: state.props.verticalAlign,
      overflowSuffix: state.props.overflowSuffix,
    };

    const renderInfoCalculateTime = performance.now();
    const renderInfo = state.lightning2TextRenderer.calculateRenderInfo();

    console.log(
      'Render info calculated in',
      performance.now() - renderInfoCalculateTime,
      'ms',
    );

    return renderInfo;
  }

  override createState(props: TrProps): CanvasTextRendererState {
    return {
      props,
      status: 'initialState',
      updateScheduled: false,
      emitter: new EventEmitter(),
      lightning2TextRenderer: new LightningTextTextureRenderer(
        this.canvas,
        this.context,
      ),
      renderWindow: undefined,
      visibleWindow: {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        valid: false,
      },
      renderInfo: undefined,
      canvasPageInfo: undefined,
      forceFullLayoutCalc: false,
      textW: 0,
      textH: 0,
      fontInfo: undefined,
      fontFaceLoadedHandler: undefined,
      isRenderable: false,
      debugData: {
        updateCount: 0,
        layoutCount: 0,
        drawCount: 0,
        lastLayoutNumCharacters: 0,
        layoutSum: 0,
        drawSum: 0,
        bufferSize: 0,
      },
    };
  }

  override updateState(state: CanvasTextRendererState): void {
    // On the first update call we need to set the status to loading
    if (!this.totalRenderTime) {
      this.totalRenderTime = performance.now();
    }

    if (state.status === 'initialState') {
      this.setStatus(state, 'loading');
    }

    if (state.status === 'loaded') {
      return;
    }

    if (state.canvasPageInfo?.texture?.state === 'loaded') {
      this.setStatus(state, 'loaded');
      return;
    }

    console.log('Rendering ', state.props.text);

    // If fontInfo is invalid, we need to establish it
    // console.log('Font info', state.fontInfo);
    if (!state.fontInfo) {
      return this.loadFont(state);
    }

    // If we're waiting for a font face to load, don't render anything
    // if (state.canvasPageInfo?.texture?.state === 'loaded') {
    //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //   //@ts-ignore - piss off typescript
    //   console.log('totalRenderTime', performance.now() - this.totalRenderTime, 'ms');
    //   this.totalRenderTime = null;
    //   return;
    // }

    if (!state.renderInfo) {
      state.renderInfo = this.calculateRenderInfo(state);

      state.textH = state.renderInfo.lineHeight * state.renderInfo.lines.length;
      state.textW = state.renderInfo.width;

      // Invalidate renderWindow because the renderInfo changed
      state.renderWindow = undefined;
    }

    const { x, y, width, height, contain } = state.props;
    const { visibleWindow } = state;

    if (!visibleWindow.valid) {
      // Figure out whats actually in the bounds of the renderer/canvas (visibleWindow)
      const elementBounds = createBound(
        x,
        y,
        contain !== 'none' ? x + width : Infinity,
        contain === 'both' ? y + height : Infinity,
        tmpElementBounds,
      );
      /**
       * Area that is visible on the screen.
       */
      intersectBound(this.rendererBounds, elementBounds, visibleWindow);
      visibleWindow.valid = true;
    }

    const drawTime = performance.now();
    const canvasPageInfo =
      state.canvasPageInfo ||
      (state.canvasPageInfo = {
        texture: undefined,
        lineNumStart: 0,
        lineNumEnd: 0,
        valid: false,
      });

    state.lightning2TextRenderer.draw(state.renderInfo, {
      lines: state.renderInfo.lines,
      lineWidths: state.renderInfo.lineWidths,
    });

    console.log('pageDrawTime', performance.now() - drawTime, 'ms');

    const loadTime = performance.now();

    const src = this.context.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    if (!(this.canvas.width === 0 || this.canvas.height === 0)) {
      canvasPageInfo.texture?.setRenderableOwner(state, false);
      canvasPageInfo.texture = this.stage.txManager.loadTexture(
        'ImageTexture',
        {
          src: src,
        },
        {
          preload: true,
        },
      );

      if (canvasPageInfo.texture.state === 'loaded') {
        console.log('Canvas text texture loaded');
        this.setStatus(state, 'loaded');
        canvasPageInfo.texture.setRenderableOwner(state, state.isRenderable);
      } else {
        canvasPageInfo.texture.once('loaded', () => {
          console.log('Canvas text texture loaded');
          this.setStatus(state, 'loaded');
          canvasPageInfo.texture?.setRenderableOwner(state, state.isRenderable);
        });
      }

      console.log(
        'Canvas text texture loading in:',
        performance.now() - loadTime,
        'ms',
      );
    }
  }

  override renderQuads(
    state: CanvasTextRendererState,
    transform: Matrix3d,
    clippingRect: RectWithValid,
    alpha: number,
  ): void {
    const { canvasPageInfo } = state;
    if (!canvasPageInfo) return;
    // if (state.status !== 'loaded') return;
    const { zIndex, color } = state.props;

    // Color alpha of text is not properly rendered to the Canvas texture, so we
    // need to apply it here.
    const combinedAlpha = alpha * getNormalizedAlphaComponent(color);
    const quadColor = mergeColorAlphaPremultiplied(0xffffffff, combinedAlpha);

    // console.log('Rendering', state.props.text, 'at', transform.tx, transform.ty, 'with alpha', combinedAlpha);

    this.stage.renderer.addQuad({
      alpha: combinedAlpha,
      clippingRect,
      colorBl: quadColor,
      colorBr: quadColor,
      colorTl: quadColor,
      colorTr: quadColor,
      width: canvasPageInfo.texture?.dimensions?.width || 0,
      height: canvasPageInfo.texture?.dimensions?.height || 0,
      texture: canvasPageInfo.texture!,
      textureOptions: {},
      shader: null,
      shaderProps: null,
      zIndex,
      tx: transform.tx,
      ty: transform.ty,
      ta: transform.ta,
      tb: transform.tb,
      tc: transform.tc,
      td: transform.td,
    });

    // if (canvasPages[1].valid) {
    //   this.stage.renderer.addQuad({
    //     alpha: combinedAlpha,
    //     clippingRect,
    //     colorBl: quadColor,
    //     colorBr: quadColor,
    //     colorTl: quadColor,
    //     colorTr: quadColor,
    //     width: canvasPages[1].texture?.dimensions?.width || 0,
    //     height: canvasPages[1].texture?.dimensions?.height || 0,
    //     texture: canvasPages[1].texture!,
    //     textureOptions: {},
    //     shader: null,
    //     shaderProps: null,
    //     zIndex,
    //     tx: transform.tx,
    //     ty: transform.ty - scrollY + renderWindow.y1 + pageSize,
    //     ta: transform.ta,
    //     tb: transform.tb,
    //     tc: transform.tc,
    //     td: transform.td,
    //   });
    // }
    // if (canvasPages[2].valid) {
    //   this.stage.renderer.addQuad({
    //     alpha: combinedAlpha,
    //     clippingRect,
    //     colorBl: quadColor,
    //     colorBr: quadColor,
    //     colorTl: quadColor,
    //     colorTr: quadColor,
    //     width: canvasPages[2].texture?.dimensions?.width || 0,
    //     height: canvasPages[2].texture?.dimensions?.height || 0,
    //     texture: canvasPages[2].texture!,
    //     textureOptions: {},
    //     shader: null,
    //     shaderProps: null,
    //     zIndex,
    //     tx: transform.tx,
    //     ty: transform.ty - scrollY + renderWindow.y1 + pageSize + pageSize,
    //     ta: transform.ta,
    //     tb: transform.tb,
    //     tc: transform.tc,
    //     td: transform.td,
    //   });
    // }

    // renderer.disableScissor();

    // if (debug.showElementRect) {
    //   this.renderer.drawBorder(
    //     Colors.Blue,
    //     elementRect.x,
    //     elementRect.y,
    //     elementRect.w,
    //     elementRect.h,
    //   );
    // }

    // if (debug.showVisibleRect) {
    //   this.renderer.drawBorder(
    //     Colors.Green,
    //     visibleRect.x,
    //     visibleRect.y,
    //     visibleRect.w,
    //     visibleRect.h,
    //   );
    // }

    // if (debug.showRenderWindow && renderWindow) {
    //   this.renderer.drawBorder(
    //     Colors.Red,
    //     x + renderWindow.x1,
    //     y + renderWindow.y1 - scrollY,
    //     x + renderWindow.x2 - (x + renderWindow.x1),
    //     y + renderWindow.y2 - scrollY - (y + renderWindow.y1 - scrollY),
    //   );
    // }
  }

  override setIsRenderable(
    state: CanvasTextRendererState,
    renderable: boolean,
  ): void {
    super.setIsRenderable(state, renderable);
    // Set state object owner from any canvas page textures
    // state.canvasPages?.forEach((pageInfo) => {
    //   pageInfo.texture?.setRenderableOwner(state, renderable);
    // });

    state.canvasPageInfo?.texture?.setRenderableOwner(state, renderable);
  }

  override destroyState(state: CanvasTextRendererState): void {
    // Remove state object owner from any canvas page textures
    // state.canvasPages?.forEach((pageInfo) => {
    //   pageInfo.texture?.setRenderableOwner(state, false);
    // });
    console.log('Destroying...');
    state.canvasPageInfo?.texture?.setRenderableOwner(state, false);

    // delete state.canvasPageInfo?.texture;
    // delete state.canvasPageInfo;
    delete state.renderInfo;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  //#endregion Overrides

  /**
   * Invalidate the visible window stored in the state. This will cause a new
   * visible window to be calculated on the next update.
   *
   * @param state
   */
  protected invalidateVisibleWindowCache(state: CanvasTextRendererState): void {
    state.visibleWindow.valid = false;
    this.setStatus(state, 'loading');
    this.scheduleUpdateState(state);
  }

  /**
   * Invalidate the layout cache stored in the state. This will cause the text
   * to be re-layed out on the next update.
   *
   * @remarks
   * This also invalidates the visible window cache.
   *
   * @param state
   */
  private invalidateLayoutCache(state: CanvasTextRendererState): void {
    state.renderInfo = undefined;
    state.visibleWindow.valid = false;
    this.setStatus(state, 'loading');
    this.scheduleUpdateState(state);
  }

  private onFontLoaded(
    state: CanvasTextRendererState,
    cssString: string,
    cacheString: string,
  ): void {
    console.log('Font loaded', cssString, cacheString);
    if (cssString !== state.fontInfo?.cssString || !state.fontInfo) {
      return;
    }
    state.fontInfo.loaded = true;
    this.fontMap.set(cacheString, true);
    this.scheduleUpdateState(state);
  }

  private onFontLoadError(
    state: CanvasTextRendererState,
    cssString: string,
    cacheString: string,
    error: Error,
  ): void {
    if (cssString !== state.fontInfo?.cssString || !state.fontInfo) {
      return;
    }

    // Font didn't actually load, but we'll log the error and mark it as loaded
    // because the browser can still render with a fallback font.
    state.fontInfo.loaded = true;

    console.error(
      `CanvasTextRenderer: Error loading font '${state.fontInfo.cssString}'`,
      error,
    );

    this.fontMap.delete(cacheString);

    this.scheduleUpdateState(state);
  }
}
