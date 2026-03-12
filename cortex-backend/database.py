
'''
 This file is responsible for setting up the database connection and session management using SQLAlchemy. 
 It loads the database URL from an environment variable, creates an engine, and defines a session factory and a base class for declarative models.
'''

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()