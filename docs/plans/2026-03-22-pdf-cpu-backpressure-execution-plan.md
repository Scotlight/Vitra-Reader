# PDF CPU Backpressure Implementation Plan

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

Goal: reduce PDF reader CPU spikes by lowering foreground render scale pressure and constraining adjacent prerender work.

Task 1: adjust pdfPageRenderer scale policy and keep JPEG hot path.
Task 2: add conservative next-page prerender backpressure to PdfContentProvider.
Task 3: update focused Vitest coverage for renderer and provider.
Task 4: verify, commit, and push.