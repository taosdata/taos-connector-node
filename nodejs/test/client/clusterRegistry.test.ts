import { Cluster, ClusterRegistry } from "@src/client/clusterRegistry";
import { Address } from "@src/common/dsn";
import logger from "@src/common/log";

function resetClusterRegistrySingleton(): void {
    ClusterRegistry._resetForTest();
}

describe("Cluster", () => {
    test("stores frozen snapshot that is isolated from input mutation", () => {
        const input = [new Address("host1", 6041), new Address("host2", 6042)];
        const cluster = new Cluster(input);

        input[0].host = "changed";
        input.push(new Address("host3", 6043));

        expect(Object.isFrozen(cluster.addresses)).toBe(true);
        expect(Object.isFrozen(cluster.addresses[0])).toBe(true);
        expect(cluster.addresses).toHaveLength(2);
        expect(cluster.addresses[0]).toEqual({ host: "host1", port: 6041 });
        expect(cluster.addresses[0]).not.toBe(input[0]);
    });

    test("addAddresses merges unique addresses and keeps cluster id stable", () => {
        const cluster = new Cluster([new Address("host1", 6041)]);
        const initialId = cluster.id;

        cluster.addAddresses([
            new Address("host1", 6041),
            new Address("host2", 6042),
        ]);

        expect(cluster.id).toBe(initialId);
        expect(cluster.addresses).toEqual([
            { host: "host1", port: 6041 },
            { host: "host2", port: 6042 },
        ]);
    });
});

describe("ClusterRegistry", () => {
    beforeEach(() => {
        resetClusterRegistrySingleton();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        resetClusterRegistrySingleton();
    });

    test("getOrCreateCluster returns the same cluster for known seed address", () => {
        const registry = ClusterRegistry.instance();
        const first = registry.getOrCreateCluster([new Address("host1", 6041)]);
        const second = registry.getOrCreateCluster([new Address("host1", 6041)]);
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(second?.id).toBe(first?.id);
    });

    test("getOrCreateCluster returns known cluster without mapping unmatched seeds", () => {
        const registry = ClusterRegistry.instance();
        const cluster = registry.getOrCreateCluster([new Address("host1", 6041)]);
        const resolved = registry.getOrCreateCluster([
            new Address("host1", 6041),
            new Address("host2", 6042),
        ]);
        expect(cluster).not.toBeNull();
        expect(resolved).not.toBeNull();
        expect(resolved?.id).toBe(cluster?.id);
        expect((registry as any).endpointToCluster.get("host2:6042")).toBeUndefined();
    });

    test("getOrCreateCluster creates a new cluster for unknown seeds", () => {
        const registry = ClusterRegistry.instance();
        const cluster = registry.getOrCreateCluster([
            new Address("seed1", 6041),
            new Address("seed2", 6042),
        ]);
        expect(cluster).not.toBeNull();
        expect(cluster?.addresses).toEqual([
            { host: "seed1", port: 6041 },
            { host: "seed2", port: 6042 },
        ]);
        expect((registry as any).endpointToCluster.get("seed1:6041")?.id).toBe(cluster?.id);
        expect((registry as any).endpointToCluster.get("seed2:6042")?.id).toBe(cluster?.id);
    });

    test("getOrCreateCluster returns null when seeds span multiple known clusters", () => {
        const registry = ClusterRegistry.instance();
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger);

        registry.getOrCreateCluster([new Address("a1", 6041)]);
        registry.getOrCreateCluster([new Address("b1", 6041)]);

        const cluster = registry.getOrCreateCluster([
            new Address("a1", 6041),
            new Address("b1", 6041),
        ]);

        expect(cluster).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            "Adapter HA: seed addresses span multiple known clusters, skipping expansion. Ensure all seeds belong to the same cluster."
        );
    });

    test("updateCluster merges discovered endpoints into one matched cluster", () => {
        const registry = ClusterRegistry.instance();
        const existing = registry.getOrCreateCluster([new Address("host1", 6041)]);
        expect(existing).not.toBeNull();

        registry.updateCluster([
            new Address("host1", 6041),
            new Address("host2", 6042),
            new Address("host3", 6043),
        ]);

        const expanded = registry.expandEndpoints([new Address("host1", 6041)]);
        expect(expanded).toEqual([
            { host: "host1", port: 6041 },
            { host: "host2", port: 6042 },
            { host: "host3", port: 6043 },
        ]);
        expect((registry as any).endpointToCluster.get("host2:6042")?.id).toBe(existing?.id);
        expect((registry as any).endpointToCluster.get("host3:6043")?.id).toBe(existing?.id);
    });

    test("updateCluster ignores discovered endpoints when no cluster matches", () => {
        const registry = ClusterRegistry.instance();
        registry.updateCluster([
            new Address("host9", 6049),
            new Address("host10", 6050),
        ]);
        expect((registry as any).endpointToCluster.size).toBe(0);
    });

    test("updateCluster aborts when discovered endpoints hit multiple clusters", () => {
        const registry = ClusterRegistry.instance();
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger);

        registry.getOrCreateCluster([new Address("a1", 6041)]);
        registry.getOrCreateCluster([new Address("b1", 6042)]);

        registry.updateCluster([
            new Address("a1", 6041),
            new Address("b1", 6042),
            new Address("c1", 6043),
        ]);

        expect((registry as any).endpointToCluster.get("c1:6043")).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
            "Adapter HA: discovered endpoints match multiple known clusters, skipping update."
        );
    });

    test("expandEndpoints returns merged endpoints when seed matches known cluster", () => {
        const registry = ClusterRegistry.instance();
        registry.getOrCreateCluster([new Address("host1", 6041)]);
        registry.updateCluster([
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

    test("expandEndpoints uses cluster id comparison instead of reference equality", () => {
        const registry = ClusterRegistry.instance();
        const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger);

        const clusterA = new Cluster([
            new Address("a1", 6041),
            new Address("a3", 6043),
        ]);
        const clusterB = new Cluster([new Address("b1", 6042)]);
        (clusterB as any).id = clusterA.id;

        (registry as any).endpointToCluster.set("a1:6041", clusterA);
        (registry as any).endpointToCluster.set("a3:6043", clusterA);
        (registry as any).endpointToCluster.set("b1:6042", clusterB);

        const seeds = [new Address("a1", 6041), new Address("b1", 6042)];
        const expanded = registry.expandEndpoints(seeds);

        expect(expanded).toEqual([
            { host: "a1", port: 6041 },
            { host: "b1", port: 6042 },
            { host: "a3", port: 6043 },
        ]);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
