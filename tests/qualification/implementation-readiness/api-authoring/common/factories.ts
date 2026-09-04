export type Service = Readonly<{ value: string }>;
export type Consumer = Readonly<{ read: () => string }>;

export const serviceFactory = (): Service => Object.freeze({ value: "selected-service" });
export const consumerFactory = (dependencies: Readonly<{ service: Service }>): Consumer => Object.freeze({ read: () => dependencies.service.value });
