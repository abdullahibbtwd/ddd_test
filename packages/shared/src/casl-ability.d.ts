/**
 * Ambient types for @casl/ability under classic Node moduleResolution
 * (package exports map types in a way Node10 resolution misses).
 */
declare module "@casl/ability" {
  export type AbilityTuple = [string, string];

  export type MongoQuery = Record<string, unknown>;

  export class AbilityBuilder<A extends MongoAbility = MongoAbility> {
    constructor(abilityFactory?: CreateAbility<A>);
    can: {
      (action: string | string[], subject: string | string[]): unknown;
      (
        action: string | string[],
        subject: string | string[],
        conditions: Record<string, unknown>,
      ): unknown;
    };
    cannot: AbilityBuilder<A>["can"];
    build(options?: object): A;
  }

  export type MongoAbility<
    T extends AbilityTuple = AbilityTuple,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    C = MongoQuery,
  > = {
    can(action: T[0], subject: T[1] | object, fieldOrConditions?: string | object): boolean;
    cannot(action: T[0], subject: T[1] | object, fieldOrConditions?: string | object): boolean;
  };

  export type CreateAbility<A extends MongoAbility = MongoAbility> = (
    rules?: unknown[],
    options?: object,
  ) => A;

  export function createMongoAbility<
    A extends AbilityTuple = AbilityTuple,
    C = MongoQuery,
  >(rules?: unknown[], options?: object): MongoAbility<A, C>;

  export function subject<T extends string>(
    type: T,
    object: Record<string, unknown>,
  ): Record<string, unknown> & { __caslSubjectType__: T };
}
