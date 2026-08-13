import os

import pytest

from app import create_app, db


@pytest.fixture
def app():
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"

    app = create_app()

    app.config.update({
        "TESTING": True
    })

    with app.app_context():
        db.drop_all()
        db.create_all()

    yield app

    with app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json["status"] == "healthy"


def test_create_todo(client):
    response = client.post(
        "/todos",
        json={"title": "Learn Docker"}
    )

    assert response.status_code == 201
    assert response.json["title"] == "Learn Docker"
    assert response.json["completed"] is False


def test_get_todos(client):
    client.post(
        "/todos",
        json={"title": "Learn Python"}
    )

    response = client.get("/todos")

    assert response.status_code == 200
    assert len(response.json) == 1
    assert response.json[0]["title"] == "Learn Python"


def test_delete_todo(client):
    create_response = client.post(
        "/todos",
        json={"title": "Delete me"}
    )

    todo_id = create_response.json["id"]

    response = client.delete(
        f"/todos/{todo_id}"
    )

    assert response.status_code == 200
    assert response.json["message"] == "Todo deleted"
