import os

import ultralytics
from ultralytics import YOLO

print(f"ultralytics={ultralytics.__version__}")
model_path = "/opt/yolo-api/yolov8m.pt"
print(f"weights={model_path}")
print(f"weights_exists={os.path.exists(model_path)}")
if os.path.exists(model_path):
    print(f"weights_size_bytes={os.path.getsize(model_path)}")
model = YOLO(model_path)
print(f"task={getattr(model, 'task', 'unknown')}")
