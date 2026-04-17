import os
os.environ.pop('TF_USE_LEGACY_KERAS', None)
import tensorflow as tf

class CustomConv2D(tf.keras.layers.Conv2D):
    def __init__(self, **kwargs):
        kwargs.pop('batch_input_shape', None)
        super().__init__(**kwargs)

try:
    model = tf.keras.models.load_model('trained_plant_disease_model.keras', custom_objects={'Conv2D': CustomConv2D})
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
