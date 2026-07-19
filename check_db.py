import sqlite3
import json

try:
    conn = sqlite3.connect("data/autoclip.db")
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, status, video_path FROM projects WHERE id = 'c5ee8d84-47e5-45a8-a99c-65a57dc618f9'")
    project = cursor.fetchone()
    if project:
        print(f"ID: {project[0]}")
        print(f"Name: {project[1]}")
        print(f"Status: {project[2]}")
        print(f"Video Path: {project[3]}")
    else:
        print("Project not found in database.")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
