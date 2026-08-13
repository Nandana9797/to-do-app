import logging

from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def create_app():
    app = Flask(__name__)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )

    app.config.from_object("app.config.Config")

    db.init_app(app)

    from app.routes import main
    app.register_blueprint(main)

    return app
