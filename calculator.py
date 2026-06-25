#!/usr/bin/env python3
"""Einfacher Kommandozeilen-Taschenrechner."""


def add(a: float, b: float) -> float:
    return a + b


def subtract(a: float, b: float) -> float:
    return a - b


def multiply(a: float, b: float) -> float:
    return a * b


def divide(a: float, b: float) -> float:
    if b == 0:
        raise ZeroDivisionError("Division durch Null ist nicht erlaubt.")
    return a / b


OPERATIONS = {
    "1": ("Addieren", add),
    "2": ("Subtrahieren", subtract),
    "3": ("Multiplizieren", multiply),
    "4": ("Dividieren", divide),
}


def read_number(prompt: str) -> float:
    while True:
        try:
            return float(input(prompt))
        except ValueError:
            print("Bitte eine gültige Zahl eingeben.")


def main() -> None:
    print("=== Taschenrechner ===")
    for key, (name, _) in OPERATIONS.items():
        print(f"{key}: {name}")
    print("q: Beenden")

    while True:
        choice = input("\nAuswahl: ").strip().lower()
        if choice == "q":
            print("Auf Wiedersehen!")
            break

        if choice not in OPERATIONS:
            print("Ungültige Auswahl.")
            continue

        name, operation = OPERATIONS[choice]
        a = read_number("Erste Zahl: ")
        b = read_number("Zweite Zahl: ")

        try:
            result = operation(a, b)
            print(f"Ergebnis ({name}): {result}")
        except ZeroDivisionError as e:
            print(f"Fehler: {e}")


if __name__ == "__main__":
    main()
