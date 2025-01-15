import type { State } from './analyze.js';
import type { PackageDefinition } from './package.js';
export type PathResolver = (aliasOrPath: string) => string | undefined;

export type Plugin = {
  name: string;
  fileBelongsTo?(path: string): boolean;
  resolver?: PathResolver;
};

type PluginFactory = (params: {
  packageDef: PackageDefinition;
  state: State;
}) => Promise<Plugin | void> | (Plugin | void);

export function createPlugin(factory: PluginFactory) {
  return factory;
}
