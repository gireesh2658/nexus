import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

celery_broker = os.getenv('CELERY_BROKER')
if not celery_broker:
    raise ValueError("FATAL: CELERY_BROKER environment variable is missing.")

# Celery Configuration
broker_url = celery_broker
result_backend = os.getenv('CELERY_RESULT_BACKEND', celery_broker)

# Task settings
task_serializer = 'json'
result_serializer = 'json'
accept_content = ['json']
timezone = 'UTC'
enable_utc = True

# Worker settings
worker_prefetch_multiplier = 1
worker_max_tasks_per_child = 100
task_acks_late = True

task_routes = {
    'focus.*': {'queue': 'focus_queue'},
    'audio.*': {'queue': 'audio_queue'},
    'behavioral.*': {'queue': 'behavioral_queue'},
    'abuse.*': {'queue': 'abuse_queue'},
}
