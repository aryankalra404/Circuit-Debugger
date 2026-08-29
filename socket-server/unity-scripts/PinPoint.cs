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
    [Tooltip("Persistent diagnostic highlight. This takes priority over hover and connection colors.")]
    public Color faultColor = Color.red;

    private bool isHighlighted;
    private bool isFaultHighlighted;

    void Awake()
    {
        RefreshVisual();
    }

    public void SetHighlighted(bool on)
    {
        isHighlighted = on;
        RefreshVisual();
    }

    public void SetFaultHighlighted(bool on)
    {
        isFaultHighlighted = on;
        RefreshVisual();
    }

    public void SetConnected(bool connected)
    {
        isOccupied = connected;
        RefreshVisual();
    }

    private void RefreshVisual()
    {
        if (pinRenderer == null) return;
        if (isFaultHighlighted) pinRenderer.material.color = faultColor;
        else if (isHighlighted) pinRenderer.material.color = highlightColor;
        else pinRenderer.material.color = isOccupied || occupyingPlug != null ? connectedColor : defaultColor;
    }
}
