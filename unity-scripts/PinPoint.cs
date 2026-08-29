using UnityEngine;

public enum PinType { Signal, Power, Ground }

public class PinPoint : MonoBehaviour
{
    [Header("Identity")]
    public string pinId; // e.g. "D13", "GND", "5V"
    public PinType pinType = PinType.Signal;

    [Header("State")]
    public bool isOccupied = false;
    public WirePlug occupyingPlug;

    [Header("Visual Feedback")]
    public Renderer pinRenderer;      // assign the small visual dot/mesh for this pin
    public Color defaultColor = Color.white;
    public Color highlightColor = Color.yellow;
    public Color connectedColor = Color.green;

    void Awake()
    {
        if (pinRenderer != null)
            pinRenderer.material.color = defaultColor;
    }

    public void SetHighlighted(bool on)
    {
        if (pinRenderer == null) return;
        pinRenderer.material.color = on ? highlightColor : (isOccupied || occupyingPlug != null ? connectedColor : defaultColor);
    }

    public void SetConnected(bool connected)
    {
        isOccupied = connected;
        if (pinRenderer != null)
            pinRenderer.material.color = connected ? connectedColor : defaultColor;
    }
}

