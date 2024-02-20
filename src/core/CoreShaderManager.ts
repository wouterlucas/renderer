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
import type { ExtractProps } from './CoreTextureManager.js';
import type { CoreRenderer } from './renderers/CoreRenderer.js';
import type { CoreShader } from './renderers/CoreShader.js';

import { DefaultShader } from './renderers/webgl/shaders/DefaultShader.js';
import { DefaultShaderBatched } from './renderers/webgl/shaders/DefaultShaderBatched.js';
import {
  DynamicShader,
  type DynamicShaderProps,
} from './renderers/webgl/shaders/DynamicShader.js';
import { RoundedRectangle } from './renderers/webgl/shaders/RoundedRectangle.js';
import { SdfShader } from './renderers/webgl/shaders/SdfShader.js';

import { RadiusEffect } from './renderers/webgl/shaders/effects/RadiusEffect.js';
import { BorderEffect } from './renderers/webgl/shaders/effects/BorderEffect.js';
import {
  LinearGradientEffect,
  type LinearGradientEffectProps,
} from './renderers/webgl/shaders/effects/LinearGradientEffect.js';
import {
  GrayscaleEffect,
  type GrayscaleEffectProps,
} from './renderers/webgl/shaders/effects/GrayscaleEffect.js';
import { BorderRightEffect } from './renderers/webgl/shaders/effects/BorderRightEffect.js';
import { BorderTopEffect } from './renderers/webgl/shaders/effects/BorderTopEffect.js';
import { BorderBottomEffect } from './renderers/webgl/shaders/effects/BorderBottomEffect.js';
import { BorderLeftEffect } from './renderers/webgl/shaders/effects/BorderLeftEffect.js';
import {
  GlitchEffect,
  type GlitchEffectProps,
} from './renderers/webgl/shaders/effects/GlitchEffect.js';
import {
  FadeOutEffect,
  type FadeOutEffectProps,
} from './renderers/webgl/shaders/effects/FadeOutEffect.js';
import {
  RadialGradientEffect,
  type RadialGradientEffectProps,
} from './renderers/webgl/shaders/effects/RadialGradientEffect.js';
import type { WebGlCoreRenderer } from './renderers/webgl/WebGlCoreRenderer.js';
import {
  RadialProgressEffect,
  type RadialProgressEffectProps,
} from './renderers/webgl/shaders/effects/RadialProgressEffect.js';

export type { FadeOutEffectProps };
export type { LinearGradientEffectProps };
export type { RadialGradientEffectProps };
export type { GrayscaleEffectProps };
export type { GlitchEffectProps };
export type { RadialProgressEffectProps };

export interface ShaderMap {
  DefaultShader: typeof DefaultShader;
  DefaultShaderBatched: typeof DefaultShaderBatched;
  RoundedRectangle: typeof RoundedRectangle;
  DynamicShader: typeof DynamicShader;
  SdfShader: typeof SdfShader;
}

export type ShaderNode<Type extends keyof ShaderMap> = {
  shader: InstanceType<ShaderMap[Type]>;
  props: Record<string, unknown>;
};

export interface EffectMap {
  radius: typeof RadiusEffect;
  border: typeof BorderEffect;
  borderBottom: typeof BorderBottomEffect;
  borderLeft: typeof BorderLeftEffect;
  borderRight: typeof BorderRightEffect;
  borderTop: typeof BorderTopEffect;
  fadeOut: typeof FadeOutEffect;
  linearGradient: typeof LinearGradientEffect;
  radialGradient: typeof RadialGradientEffect;
  grayscale: typeof GrayscaleEffect;
  glitch: typeof GlitchEffect;
  radialProgress: typeof RadialProgressEffect;
}

export type EffectProps =
  | FadeOutEffectProps
  | LinearGradientEffectProps
  | RadialGradientEffectProps
  | GrayscaleEffectProps
  | GlitchEffectProps
  | RadialProgressEffectProps;

export class CoreShaderManager {
  protected shCache: Map<string, InstanceType<ShaderMap[keyof ShaderMap]>> =
    new Map();
  protected shConstructors: Partial<ShaderMap> = {};
  protected attachedShader: CoreShader | null = null;
  protected effectConstructors: Partial<EffectMap> = {};
  renderer!: CoreRenderer;

  constructor() {
    this.registerShaderType('DefaultShader', DefaultShader);
    this.registerShaderType('DefaultShaderBatched', DefaultShaderBatched);
    this.registerShaderType('RoundedRectangle', RoundedRectangle);
    this.registerShaderType('DynamicShader', DynamicShader);
    this.registerShaderType('SdfShader', SdfShader);

    this.registerEffectType('border', BorderEffect);
    this.registerEffectType('borderBottom', BorderBottomEffect);
    this.registerEffectType('borderLeft', BorderLeftEffect);
    this.registerEffectType('borderRight', BorderRightEffect);
    this.registerEffectType('borderTop', BorderTopEffect);
    this.registerEffectType('fadeOut', FadeOutEffect);
    this.registerEffectType('linearGradient', LinearGradientEffect);
    this.registerEffectType('radialGradient', RadialGradientEffect);
    this.registerEffectType('grayscale', GrayscaleEffect);
    this.registerEffectType('glitch', GlitchEffect);
    this.registerEffectType('radius', RadiusEffect);
    this.registerEffectType('radialProgress', RadialProgressEffect);
  }

  registerShaderType<Type extends keyof ShaderMap>(
    shType: Type,
    shClass: ShaderMap[Type],
  ): void {
    this.shConstructors[shType] = shClass;
  }

  registerEffectType<Type extends keyof EffectMap>(
    effectType: Type,
    effectClass: EffectMap[Type],
  ): void {
    this.effectConstructors[effectType] = effectClass;
  }

  getRegisteredEffects(): Partial<EffectMap> {
    return this.effectConstructors;
  }

  getRegisteredShaders(): Partial<ShaderMap> {
    return this.shConstructors;
  }

  loadShader<Type extends keyof ShaderMap>(
    shType: Type,
    props?: ExtractProps<ShaderMap[Type]>,
  ): ShaderNode<Type> {
    if (!this.renderer) {
      throw new Error(`Renderer is not been defined`);
    }
    const ShaderClass = this.shConstructors[shType];
    if (!ShaderClass) {
      throw new Error(`Shader type "${shType as string}" is not registered`);
    }

    if (shType === 'DynamicShader') {
      return this.loadDynamicShader(props!);
    }

    const resolvedProps = ShaderClass.resolveDefaults(
      props as Record<string, unknown>,
    );
    const cacheKey =
      ShaderClass.makeCacheKey(resolvedProps) || ShaderClass.name;
    if (cacheKey && this.shCache.has(cacheKey)) {
      return {
        shader: this.shCache.get(cacheKey) as InstanceType<ShaderMap[Type]>,
        props: resolvedProps,
      };
    }

    // @ts-expect-error ShaderClass WILL accept a Renderer
    const shader = new ShaderClass(this.renderer, props) as InstanceType<
      ShaderMap[Type]
    >;
    if (cacheKey) {
      this.shCache.set(cacheKey, shader);
    }
    return {
      shader,
      props: resolvedProps,
    };
  }

  loadDynamicShader<Type extends keyof ShaderMap>(
    props: DynamicShaderProps,
  ): ShaderNode<Type> {
    if (!this.renderer) {
      throw new Error(`Renderer is not been defined`);
    }
    const resolvedProps = DynamicShader.resolveDefaults(
      props as Record<string, unknown>,
      this.effectConstructors,
    );
    const cacheKey = DynamicShader.makeCacheKey(
      resolvedProps,
      this.effectConstructors,
    );
    if (cacheKey && this.shCache.has(cacheKey)) {
      return {
        shader: this.shCache.get(cacheKey) as InstanceType<ShaderMap[Type]>,
        props: resolvedProps,
      };
    }
    const shader = new DynamicShader(
      this.renderer as WebGlCoreRenderer,
      props,
      this.effectConstructors,
    );
    if (cacheKey) {
      this.shCache.set(cacheKey, shader);
    }
    return {
      shader: shader as InstanceType<ShaderMap[Type]>,
      props: resolvedProps,
    };
  }

  useShader(shader: CoreShader): void {
    if (this.attachedShader === shader) {
      return;
    }
    if (this.attachedShader) {
      this.attachedShader.detach();
    }
    shader.attach();
    this.attachedShader = shader;
  }
}
