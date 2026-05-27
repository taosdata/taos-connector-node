import { ClusterRegistry } from "@src/client/clusterRegistry";
import { Address } from "@src/common/dsn";
import logger from "@src/common/log";

function resetClusterRegistrySingleton(): void {
    (ClusterRegistry as any)._instance = undefined;
}

describe("ClusterRegistry", () => {
    beforeEach(() => {
        resetClusterRegistrySingleton();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        resetClusterRegistrySingleton();
    });

    test("registerCluster stores frozen snapshot that is isolated from input mutation", () => {
        const registry = ClusterRegistry.instance();
        const input = [new Address("host1", 6041), new Address("host2", 6042)];

        registry.registerCluster(input);
        input[0].host = "changed";
        input.push(new Address("host3", 6043));

        const snapshot = (registry as any).endpointToCluster.get("host1:6041");
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(snapshot).toHaveLength(2);
        expect(snapshot[0]).toEqual({ host: "host1", port: 6041 });
        expect(snapshot[0]).not.toBe(input[0]);
    });

    test("expandEndpoints returns merged endpoints when seed matches known cluster", () => {
        const registry = ClusterRegistry.instance();
        registry.registerCluster([
            new Address("host1", 6041),
            new Address("host2", 6042),
            new Address("host3", 6043),
        ]);

        const seeds = [new Address("host1", 6041)];
        const expanded = registry.expandEndpoints(seeds);

        expect(expanded).toEqual([
            { host: "host1", port: 6041 },
            { host: "host2", port: 6042 },
            { host: "host3", port: 6043 },
        ]);
        expect(expanded).not.toBe(seeds);
        expect(expanded[0]).not.toBe(seeds[0]);
    });

    test("expandEndpoints returns seed deep copy when no known cluster matches", () => {
        const registry = ClusterRegistry.instance();
        const seeds = [new Address("seed1", 6041), new Address("seed2", 6042)];

        const expanded = registry.expandEndpoints(seeds);

        expect(expanded).toEqual([
            { host: "seed1", port: 6041 },
            { host: "seed2", port: 6042 },
        ]);
        expect(expanded).not.toBe(seeds);
        expect(expanded[0]).not.toBe(seeds[0]);

        expanded[0].host = "changed";
        expect(seeds[0].host).toBe("seed1");
    });

    test("expandEndpoints rejects expansion when seeds span multiple clusters", () => {
        const registry = ClusterRegistry.instance();
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger);

        registry.registerCluster([new Address("a1", 6041), new Address("a2", 6042)]);
        registry.registerCluster([new Address("b1", 6041), new Address("b2", 6042)]);

        const seeds = [new Address("a1", 6041), new Address("b1", 6041)];
        const expanded = registry.expandEndpoints(seeds);

        expect(expanded).toEqual([
            { host: "a1", port: 6041 },
            { host: "b1", port: 6041 },
        ]);
        expect(warnSpy).toHaveBeenCalledWith(
            "Adapter HA: seed addresses span multiple known clusters, skipping expansion. Ensure all seeds belong to the same cluster."
        );
    });

    test("latest cluster registration can enrich previously discovered endpoints", () => {
        const registry = ClusterRegistry.instance();

        registry.registerCluster([new Address("host1", 6041), new Address("host2", 6042)]);
        registry.registerCluster([
            new Address("host1", 6041),
            new Address("host2", 6042),
            new Address("host3", 6043),
        ]);

        const expanded = registry.expandEndpoints([new Address("host2", 6042)]);
        expect(expanded).toEqual([
            { host: "host2", port: 6042 },
            { host: "host1", port: 6041 },
            { host: "host3", port: 6043 },
        ]);
    });
});
