using System;
using System.Collections;
using Newtonsoft.Json.Linq;
using SocketIOClient;
using SocketIOClient.Newtonsoft.Json;
using UnityEngine;

/// <summary>
/// Adapts the existing CircuitGraph (created by JumperWire) to the CircuitQuest
/// Socket.IO bridge. Attach this to WireManager and assign the terminal points.
/// </summary>
public class QuestCircuitBridge : MonoBehaviour
{
    [Header("Laptop bridge - use your laptop's Wi-Fi IP, never localhost")]
    [SerializeField] private string bridgeUrl = "http://192.168.1.5:3001";
    [SerializeField] private string sessionId = "demo-room";

    [Header("Existing circuit system")]
    [SerializeField] private CircuitGraph circuitGraph;

    [Header("First mission components")]
    [SerializeField] private PinPoint ledAnode;
    [SerializeField] private PinPoint ledCathode;
    [SerializeField] private PinPoint resistorA;
    [SerializeField] private PinPoint resistorB;
    [SerializeField] private VirtualLed virtualLed;

    private SocketIOUnity socket;
    private string lastCircuitJson = "";
    private bool hasPendingLedState;
    private bool pendingLedState;

    private async void Start()
    {
        if (circuitGraph == null) circuitGraph = GetComponent<CircuitGraph>();
        if (circuitGraph == null)
        {
            Debug.LogError("[QuestCircuitBridge] Assign the CircuitGraph on WireManager.");
            enabled = false;
            return;
        }

        socket = new SocketIOUnity(new Uri(bridgeUrl), new SocketIOOptions
        {
            Transport = SocketIOClient.Transport.TransportProtocol.WebSocket
        });
        // Needed for reliable IL2CPP / Android JSON serialization.
        socket.JsonSerializer = new NewtonsoftJsonSerializer();
        socket.On("simulation:led", OnLedEvent);
        socket.On("circuit:result", OnCircuitResult);

        try
        {
            await socket.ConnectAsync();
            socket.Emit("session:join", new { sessionId });
            StartCoroutine(SendCircuitWhenChanged());
            Debug.Log($"[QuestCircuitBridge] Connected to {bridgeUrl}, session {sessionId}.");
        }
        catch (Exception error)
        {
            Debug.LogError($"[QuestCircuitBridge] Could not connect: {error.Message}");
        }
    }

    private IEnumerator SendCircuitWhenChanged()
    {
        while (enabled)
        {
            SendCircuitIfChanged();
            yield return new WaitForSeconds(0.2f);
        }
    }

    private void Update()
    {
        // Socket callbacks can be on a background thread; only touch Unity objects here.
        if (!hasPendingLedState) return;
        hasPendingLedState = false;
        if (virtualLed != null) virtualLed.SetLit(pendingLedState);
    }

    private void SendCircuitIfChanged()
    {
        if (socket == null || !socket.Connected) return;
        JObject circuit = BuildCircuit();
        string json = circuit.ToString(Newtonsoft.Json.Formatting.None);
        if (json == lastCircuitJson) return;

        lastCircuitJson = json;
        socket.Emit("circuit:update", new JObject
        {
            ["sessionId"] = sessionId,
            ["circuit"] = circuit
        });
    }

    private JObject BuildCircuit()
    {
        JArray components = new JArray();
        if (ledAnode != null && ledCathode != null)
        {
            components.Add(new JObject
            {
                ["id"] = "led-1",
                ["type"] = "led",
                ["anode"] = ledAnode.pinId,
                ["cathode"] = ledCathode.pinId
            });
        }
        if (resistorA != null && resistorB != null)
        {
            components.Add(new JObject
            {
                ["id"] = "resistor-1",
                ["type"] = "resistor",
                ["a"] = resistorA.pinId,
                ["b"] = resistorB.pinId
            });
        }

        JArray wires = new JArray();
        foreach (Connection connection in circuitGraph.connections)
        {
            if (connection.pinA == null || connection.pinB == null) continue;
            wires.Add(new JObject { ["from"] = connection.pinA.pinId, ["to"] = connection.pinB.pinId });
        }
        return new JObject { ["components"] = components, ["wires"] = wires };
    }

    private void OnLedEvent(SocketIOResponse response)
    {
        JObject payload = response.GetValue<JObject>();
        if (payload == null || payload.Value<string>("componentId") != "led-1") return;
        pendingLedState = payload.Value<bool>("on");
        hasPendingLedState = true;
    }

    private void OnCircuitResult(SocketIOResponse response)
    {
        JObject payload = response.GetValue<JObject>();
        Debug.Log($"[QuestCircuitBridge] {(payload.Value<bool>("ok") ? "Circuit valid" : "Circuit error")}: {payload.Value<string>("message")}");
    }

    private async void OnDestroy()
    {
        if (socket != null) await socket.DisconnectAsync();
    }
}
