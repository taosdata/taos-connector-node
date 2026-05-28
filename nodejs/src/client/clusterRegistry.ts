import { randomUUID } from "crypto";
import { Address, mergeAddresses } from "../common/dsn";
import logger from "../common/log";

export class Cluster {
    readonly id: string;
    private _addresses: readonly Address[];

    constructor(addresses: Address[]) {
        this.id = randomUUID();
        this._addresses = Cluster.freezeAddresses(addresses);
    }

    get addresses(): readonly Address[] {
        return this._addresses;
    }

    addAddresses(addresses: Address[]): void {
        const merged = mergeAddresses([...this._addresses], addresses);
        this._addresses = Cluster.freezeAddresses(merged);
    }

    private static freezeAddresses(addresses: Address[]): readonly Address[] {
        return Object.freeze(
            addresses.map((address) =>
                Object.freeze(new Address(address.host, address.port))
            )
        );
    }
}

export class ClusterRegistry {
    private static _instance?: ClusterRegistry;
    private endpointToCluster: Map<string, Cluster> = new Map();

    private constructor() { }

    public static instance(): ClusterRegistry {
        if (!ClusterRegistry._instance) {
            ClusterRegistry._instance = new ClusterRegistry();
        }
        return ClusterRegistry._instance;
    }

    private endpointKey(address: Address): string {
        return `${address.host}:${address.port}`;
    }

    private collectMatchedClusters(addresses: Address[]): Map<string, Cluster> {
        const matchedClusters = new Map<string, Cluster>();
        for (const address of addresses) {
            const cluster = this.endpointToCluster.get(this.endpointKey(address));
            if (!cluster) {
                continue;
            }
            matchedClusters.set(cluster.id, cluster);
        }
        return matchedClusters;
    }

    public getOrCreateCluster(seeds: Address[]): Cluster | null {
        const matchedClusters = this.collectMatchedClusters(seeds);
        if (matchedClusters.size > 1) {
            logger.warn(
                "Adapter HA: seed addresses span multiple known clusters, " +
                "skipping expansion. Ensure all seeds belong to the same cluster."
            );
            return null;
        }
        if (matchedClusters.size === 1) {
            return matchedClusters.values().next().value as Cluster;
        }

        const cluster = new Cluster(seeds);
        for (const seed of seeds) {
            this.endpointToCluster.set(this.endpointKey(seed), cluster);
        }
        return cluster;
    }

    public updateCluster(discovered: Address[]): void {
        if (discovered.length === 0) {
            return;
        }

        const matchedClusters = this.collectMatchedClusters(discovered);
        if (matchedClusters.size === 0) {
            return;
        }

        if (matchedClusters.size > 1) {
            logger.warn(
                "Adapter HA: discovered endpoints match multiple known clusters, skipping update."
            );
            return;
        }

        const cluster = matchedClusters.values().next().value as Cluster;
        cluster.addAddresses(discovered);
        for (const address of discovered) {
            this.endpointToCluster.set(this.endpointKey(address), cluster);
        }
    }

    public expandEndpoints(seeds: Address[]): Address[] {
        let matchedCluster: Cluster | null = null;

        for (const seed of seeds) {
            const cluster = this.endpointToCluster.get(this.endpointKey(seed));
            if (!cluster) {
                continue;
            }

            if (matchedCluster === null) {
                matchedCluster = cluster;
                continue;
            }

            if (matchedCluster.id !== cluster.id) {
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

        return mergeAddresses(seeds, [...matchedCluster.addresses]);
    }
}
