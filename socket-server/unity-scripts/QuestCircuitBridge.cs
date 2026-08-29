using System;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using SocketIOClient;
using SocketIOClient.Newtonsoft.Json;
using UnityEngine;

/// <summary>
/// Sends the physical CircuitGraph to the CircuitDoctor Socket.IO bridge.
/// Attach this to WireManager and configure component lists in the Inspector.
/// </summary>
public class QuestCircuitBridge : MonoBehaviour
{
    [Serializable]
    public class LedDefinition
    {
        [Tooltip("Must match the server component ID, e.g. led-1.")]
        public string id = "led-1";
        [Tooltip("Long leg / anode PinPoint. Assign LED1_L1 for LED 1.")]
        public PinPoint anode;
        [Tooltip("Short leg / cathode PinPoint. Assign LED1_L2 for LED 1.")]
        public PinPoint cathode;
        [Tooltip("The virtual AR LED to light when simulation:led targets this ID.")]
        public VirtualLed virtualLed;
    }

    [Serializable]
    public class ResistorDefinition
    {
        [Tooltip("Must match the server component ID, e.g. resistor-1.")]
        public string id = "resistor-1";
        [Tooltip("First resistor terminal PinPoint, e.g. RES1_R1.")]
        public PinPoint a;
        [Tooltip("Second resistor terminal PinPoint, e.g. RES1_R2.")]
        public PinPoint b;
    }

    [Serializable]
    public class PirDefinition
    {
        [Tooltip("Must match the server component ID, e.g. pir-1.")]
        public string id = "pir-1";
        public PinPoint vcc;
        public PinPoint signal;
        public PinPoint gnd;
    }

    [Header("Laptop bridge - use your laptop's Wi-Fi IP, never localhost")]
    [SerializeField] private string bridgeUrl = "http://192.168.1.5:3001";
    [SerializeField] private string sessionId = "demo-room";

    [Header("Existing circuit system")]
    [SerializeField] private CircuitGraph circuitGraph;

    [Header("Circuit components — configure these lists in the Inspector")]
    [Tooltip("Add led-1, led-2, led-3 and assign LED1_L1/L2, LED2_L1/L2, LED3_L1/L2 plus each virtual LED.")]
    [SerializeField] private List<LedDefinition> leds = new List<LedDefinition>();
    [Tooltip("Add resistor-1, resistor-2, resistor-3 and assign RES1_R1/R2, RES2_R1/R2, RES3_R1/R2.")]
    [SerializeField] private List<ResistorDefinition> resistors = new List<ResistorDefinition>();
    [Tooltip("Add pir-1 and assign PIR_VCC, PIR_SIGNAL, and PIR_GND.")]
    [SerializeField] private List<PirDefinition> pirSensors = new List<PirDefinition>();

    private SocketIOUnity socket;
    private string lastCircuitJson = "";
    private readonly Dictionary<string, VirtualLed> ledVisuals = new Dictionary<string, VirtualLed>();
    private readonly Dictionary<string, bool> pendingLedStates = new Dictionary<string, bool>();
    private readonly object pendingLedLock = new object();

    private void Awake()
    {
        BuildLedVisualMap();
    }

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

    private void BuildLedVisualMap()
    {
        ledVisuals.Clear();
        foreach (LedDefinition led in leds)
        {
            if (led == null || string.IsNullOrWhiteSpace(led.id) || led.virtualLed == null) continue;
            if (ledVisuals.ContainsKey(led.id))
            {
                Debug.LogWarning($"[QuestCircuitBridge] Duplicate LED component id '{led.id}'. Only the first virtual LED will receive simulation events.");
                continue;
            }
            ledVisuals.Add(led.id, led.virtualLed);
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
        // Socket callbacks may be on a background thread. Apply all visual
        // changes on Unity's main thread.
        List<KeyValuePair<string, bool>> states;
        lock (pendingLedLock)
        {
            if (pendingLedStates.Count == 0) return;
            states = new List<KeyValuePair<string, bool>>(pendingLedStates);
            pendingLedStates.Clear();
        }

        foreach (KeyValuePair<string, bool> state in states)
        {
            VirtualLed visual;
            if (ledVisuals.TryGetValue(state.Key, out visual) && visual != null)
            {
                visual.SetLit(state.Value);
            }
        }
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

        foreach (LedDefinition led in leds)
        {
            if (!HasPins(led != null ? led.id : null, led != null ? led.anode : null, led != null ? led.cathode : null)) continue;
            components.Add(new JObject
            {
                ["id"] = led.id,
                ["type"] = "led",
                ["anode"] = led.anode.pinId,
                ["cathode"] = led.cathode.pinId
            });
        }

        foreach (ResistorDefinition resistor in resistors)
        {
            if (!HasPins(resistor != null ? resistor.id : null, resistor != null ? resistor.a : null, resistor != null ? resistor.b : null)) continue;
            components.Add(new JObject
            {
                ["id"] = resistor.id,
                ["type"] = "resistor",
                ["a"] = resistor.a.pinId,
                ["b"] = resistor.b.pinId
            });
        }

        foreach (PirDefinition pir in pirSensors)
        {
            if (!HasPins(pir != null ? pir.id : null, pir != null ? pir.vcc : null, pir != null ? pir.signal : null, pir != null ? pir.gnd : null)) continue;
            components.Add(new JObject
            {
                ["id"] = pir.id,
                ["type"] = "pir",
                ["vcc"] = pir.vcc.pinId,
                ["signal"] = pir.signal.pinId,
                ["gnd"] = pir.gnd.pinId
            });
        }

        // Existing CircuitGraph wire serialization is deliberately unchanged.
        JArray wires = new JArray();
        foreach (Connection connection in circuitGraph.connections)
        {
            if (connection.pinA == null || connection.pinB == null) continue;
            wires.Add(new JObject { ["from"] = connection.pinA.pinId, ["to"] = connection.pinB.pinId });
        }
        return new JObject { ["components"] = components, ["wires"] = wires };
    }

    private static bool HasPins(string componentId, params PinPoint[] pins)
    {
        if (string.IsNullOrWhiteSpace(componentId)) return false;
        foreach (PinPoint pin in pins)
        {
            if (pin == null || string.IsNullOrWhiteSpace(pin.pinId)) return false;
        }
        return true;
    }

    private void OnLedEvent(SocketIOResponse response)
    {
        JObject payload = response.GetValue<JObject>();
        string componentId = payload != null ? payload.Value<string>("componentId") : null;
        if (string.IsNullOrWhiteSpace(componentId) || !ledVisuals.ContainsKey(componentId)) return;

        lock (pendingLedLock)
        {
            pendingLedStates[componentId] = payload.Value<bool>("on");
        }
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
