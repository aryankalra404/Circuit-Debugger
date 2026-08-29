# CircuitDoctor Scripts

Run these commands from the host. They execute inside the running
`circuitdoctor-dev` container.

1. Check GPU access:

   ```bash
   docker exec -it circuitdoctor-dev python /workspace/scripts/check_gpu.py
   ```

2. Train YOLOv8n with the local LabelImg YOLO dataset:

   ```bash
   docker exec -it circuitdoctor-dev python /workspace/scripts/train.py
   ```

   Optional overrides:

   ```bash
   docker exec -it circuitdoctor-dev python /workspace/scripts/train.py --epochs 50 --batch 8 --imgsz 640 --data /workspace/data/yolo/data.yaml
   ```

3. Run an inference sanity check:

   ```bash
   docker exec -it circuitdoctor-dev python /workspace/scripts/infer.py --image /workspace/data/test.jpg
   ```

4. Run a diagnosis test:

   ```bash
   docker exec -it circuitdoctor-dev python /workspace/scripts/diagnose.py --image /workspace/data/test.jpg --baseline /workspace/baseline_config.json
   ```

5. Start the Streamlit demo:

   ```bash
   docker exec -it circuitdoctor-dev streamlit run /workspace/scripts/app.py --server.port 8501 --server.address 0.0.0.0
   ```

The trained model is expected at `/workspace/runs/circuitdoctor_v1/weights/best.pt`.
Annotated images are saved in `/workspace/runs/inference/`.
