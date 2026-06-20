"""Shared Celery application instance for all Nexus workers."""
import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

from celery import Celery

celery_app = Celery('nexus_workers')
celery_app.config_from_object('celeryconfig')
