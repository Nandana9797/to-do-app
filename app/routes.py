from flask import Blueprint, jsonify, request

from app import db
from app.models import Todo


main = Blueprint("main", __name__)


@main.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"})


@main.route("/todos", methods=["GET"])
def get_todos():
    todos = Todo.query.all()

    return jsonify([
        todo.to_dict()
        for todo in todos
    ])


@main.route("/todos", methods=["POST"])
def create_todo():
    data = request.get_json()

    if not data or not data.get("title"):
        return jsonify({
            "error": "Title is required"
        }), 400

    todo = Todo(
        title=data["title"]
    )

    db.session.add(todo)
    db.session.commit()

    return jsonify(todo.to_dict()), 201


@main.route("/todos/<int:todo_id>", methods=["PUT"])
def update_todo(todo_id):
    todo = db.session.get(Todo, todo_id)

    if todo is None:
        return jsonify({
            "error": "Todo not found"
        }), 404

    data = request.get_json()

    if "title" in data:
        todo.title = data["title"]

    if "completed" in data:
        todo.completed = data["completed"]

    db.session.commit()

    return jsonify(todo.to_dict()), 200


@main.route("/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    todo = db.session.get(Todo, todo_id)

    if todo is None:
        return jsonify({
            "error": "Todo not found"
        }), 404

    db.session.delete(todo)
    db.session.commit()

    return jsonify({
        "message": "Todo deleted"
    }), 200
