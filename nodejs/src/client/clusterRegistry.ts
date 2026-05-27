import { Address, mergeAddresses } from "../common/dsn";
import logger from "../common/log";

export class ClusterRegistry {
    private static _instance?: ClusterRegistry;
    private endpointToCluster: Map<string, readonly Address[]> = new Map();

    private constructor() { }

    public static instance(): ClusterRegistry {
        if (!ClusterRegistry._instance) {
            ClusterRegistry._instance = new ClusterRegistry();
        }
        return ClusterRegistry._instance;
    }

    public registerCluster(addresses: Address[]): void {
        const snapshot: Address[] = addresses.map(
            (address) => Object.freeze(new Address(address.host, address.port))
        );
        Object.freeze(snapshot);
        for (const address of snapshot) {
            this.endpointToCluster.set(`${address.host}:${address.port}`, snapshot);
        }
    }

    public expandEndpoints(seeds: Address[]): Address[] {
        let matchedCluster: readonly Address[] | null = null;

        for (const seed of seeds) {
            const cluster = this.endpointToCluster.get(`${seed.host}:${seed.port}`);
            if (!cluster) {
                continue;
            }

            if (matchedCluster === null) {
                matchedCluster = cluster;
                continue;
            }

            if (matchedCluster !== cluster) {
                logger.warn(
                    "Adapter HA: seed addresses span multiple known clusters, " +
                    "skipping expansion. Ensure all seeds belong to the same cluster."
                );
                return seeds.map((seedAddress) =>
                    new Address(seedAddress.host, seedAddress.port)
                );
            }
        }

        if (!matchedCluster) {
            return seeds.map((seedAddress) =>
                new Address(seedAddress.host, seedAddress.port)
            );
        }

        return mergeAddresses(seeds, [...matchedCluster]);
    }
}
