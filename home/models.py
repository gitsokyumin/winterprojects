from django.db import models

class Journal(models.Model):
    subject = models.CharField(max_length=500)
    Club = models.CharField(max_length=100)
    Press = models.CharField(max_length=100)
    content = models.TextField()
    create_date = models.DateTimeField()

    def __str__(self) :
        return self.subject

class Comment(models.Model):
    journal = models.ForeignKey(Journal, on_delete=models.CASCADE)
    content = models.TextField()
    create_date = models.DateTimeField()

   