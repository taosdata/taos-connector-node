import { ClusterRegistry } from "@src/client/clusterRegistry";
import { RetryConfig, WebSocketConnector } from "@src/client/wsConnector";
import { AddressConnectionTracker } from "@src/common/addressConnectionTracker";
import { Address, parse } from "@src/common/dsn";

function createInflightStore(): any {
    return {
        insert: jest.fn(),
        remove: jest.fn(),
        getRequests: jest.fn(() => []),
        clear: jest.fn(),
    };
}

function createBareAdapterHaConnector(seedDsn: string): any {
    const connector = Object.create(WebSocketConnector.prototype) as any;
    connector._poolKey = "ws://pool/key";
    connector._dsn = parse(seedDsn);
    connector._currentAddress = connector._dsn.addresses[0];
    connector._retryConfig = new RetryConfig(1, 1, 8);
    connector._reconnectLock = null;
    connector._isReconnecting = false;
    connector._allowReconnect = true;
    connector._connectionReady = Promise.resolve();
    connector._suppressedSockets = new WeakSet();
    connector._sessionRecoveryHook = null;
    connector._inflightStore = createInflightStore();
    connector._conn = {
        readyState: 1,
        send: jest.fn(),
        close: jest.fn(),
    };
    return connector;
}

function resetClusterRegistrySingleton(): void {
    (ClusterRegistry as any)._instance = undefined;
}

describe("WebSocketConnector adapter ha", () => {
    beforeEach(() => {
        resetClusterRegistrySingleton();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        resetClusterRegistrySingleton();
    });

    test("constructor expands dsn addresses from registry when adapter_ha=true", () => {
        const createConnectionSpy = jest
            .spyOn(WebSocketConnector.prototype as any, "createConnection")
            .mockImplementation(() => { });

        const registry = ClusterRegistry.instance();
        registry.getOrCreateCluster([new Address("host1", 6041)]);
        registry.updateCluster([
            new Address("host1", 6041),
            new Address("host2", 6042),
        ]);

        const connector = new WebSocketConnector(
            parse("ws://root:taosdata@host1:6041?adapter_ha=true"),
            "pool-key",
            null
        ) as any;

        expect(connector._dsn.addresses).toEqual([
            { host: "host1", port: 6041 },
            { host: "host2", port: 6042 },
        ]);
        expect(createConnectionSpy).toHaveBeenCalledTimes(1);
    });

    test("mergeDiscoveredEndpoints extends dsn addresses and updates cluster registry", () => {
        const connector = createBareAdapterHaConnector(
            "ws://root:taosdata@host1:6041?adapter_ha=true"
        );
        const updateSpy = jest.spyOn(ClusterRegistry.instance(), "updateCluster");

        connector.mergeDiscoveredEndpoints([
            "host2:6042",
            "host3:6043",
        ]);

        expect(updateSpy).toHaveBeenCalledWith([
            { host: "host2", port: 6042 },
            { host: "host3", port: 6043 },
        ]);
        expect(connector._dsn.addresses).toEqual([
            { host: "host1", port: 6041 },
            { host: "host2", port: 6042 },
            { host: "host3", port: 6043 },
        ]);
    });

    test("mergeDiscoveredEndpoints keeps pool key unchanged", () => {
        const connector = createBareAdapterHaConnector(
            "ws://root:taosdata@host1:6041?adapter_ha=true"
        );
        const initialPoolKey = connector.getPoolKey();

        connector.mergeDiscoveredEndpoints(["host2:6042"]);

        expect(connector.getPoolKey()).toBe(initialPoolKey);
    });

    test("selectLeastConnectedAddress selects from dsn addresses", () => {
        const connector = createBareAdapterHaConnector(
            "ws://root:taosdata@host1:6041?adapter_ha=true"
        );
        connector._dsn.addresses = [
            new Address("host1", 6041),
            new Address("host2", 6042),
        ];

        const selectSpy = jest
            .spyOn(AddressConnectionTracker.instance(), "selectLeastConnected")
            .mockReturnValue(1);

        const selected = connector.selectLeastConnectedAddress();

        expect(selectSpy).toHaveBeenCalledWith(connector._dsn.addresses);
        expect(selected).toEqual({ host: "host2", port: 6042 });
    });

    test("attemptReconnect iterates all dsn addresses", async () => {
        const connector = createBareAdapterHaConnector(
            "ws://root:taosdata@host1:6041?adapter_ha=true"
        );
        connector._retryConfig = new RetryConfig(1, 1, 8);
        connector._dsn.addresses = [
            new Address("host1", 6041),
            new Address("host2", 6042),
        ];
        connector.sleep = jest.fn(async () => { });
        connector.reconnect = jest.fn(async () => {
            throw new Error("down");
        });
        connector.selectLeastConnectedAddress = jest.fn(() => connector._dsn.addresses[1]);

        await expect(connector.attemptReconnect()).rejects.toThrow(
            "Failed to reconnect to any available address"
        );
        expect(connector.reconnect).toHaveBeenCalledTimes(2);
    });
});
